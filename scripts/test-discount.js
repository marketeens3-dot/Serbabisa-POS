// Test fitur diskon persen: checkout dengan discountPercent → server harus
// menghitung ulang discountAmount = floor(subtotal × pct / 100), menyimpan
// discountPercent, dan DTO mengembalikan keduanya.
const BASE = 'http://localhost:3000'

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email: 'kasir@demo.local', password: process.env.DEMO_KASIR_PASSWORD ?? '' }),
  })
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!res.ok) throw new Error(`login gagal: ${res.status}`)
  return cookie
}

async function getCatalog(cookie) {
  const res = await fetch(`${BASE}/api/catalog?status=ACTIVE&pageSize=5`, { headers: { cookie } })
  const json = await res.json()
  return json.data.filter((i) => i.type === 'PRODUCT' && i.stockQty >= 10).slice(0, 2)
}

async function checkout(cookie, body) {
  const res = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

let failures = 0
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

;(async () => {
  const cookie = await login()
  const items = await getCatalog(cookie)
  if (items.length < 1) throw new Error('katalog kosong / stok kurang')
  const item = items[0]

  // ---- TEST 1: diskon 10% ke seluruh produk ----
  const qty = 3
  const subtotal = Math.round(qty * item.sellingPrice)
  const expectedDiscount = Math.floor((subtotal * 10) / 100)
  const r1 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: qty }],
    discountPercent: 10,
    discountAmount: 999999, // DIABAIKAN server — harus ditimpa hasil hitung ulang
    paymentMethod: 'CASH',
    paidAmount: subtotal, // cukup: total = subtotal - diskon
  })
  check('checkout diskon 10% sukses', r1.status === 201, `HTTP ${r1.status} ${JSON.stringify(r1.json).slice(0, 200)}`)
  if (r1.status === 201) {
    const t = r1.json.transaction
    check('subtotal benar', t.subtotal === subtotal, `${t.subtotal} vs ${subtotal}`)
    check('discountAmount = floor(subtotal×10/100)', t.discountAmount === expectedDiscount, `${t.discountAmount} vs ${expectedDiscount}`)
    check('discountPercent tersimpan = 10', t.discountPercent === 10, String(t.discountPercent))
    check('total = subtotal - diskon', t.totalAmount === subtotal - expectedDiscount, `${t.totalAmount} vs ${subtotal - expectedDiscount}`)
  }

  // ---- TEST 2: diskon 12.5% (desimal) ----
  const r2 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: 2 }],
    discountPercent: 12.5,
    paymentMethod: 'CASH',
    paidAmount: 10_000_000,
  })
  const sub2 = Math.round(2 * item.sellingPrice)
  const exp2 = Math.floor((sub2 * 12.5) / 100)
  check('checkout diskon 12,5% sukses', r2.status === 201, `HTTP ${r2.status}`)
  if (r2.status === 201) {
    check('desimal benar (12.5%)', r2.json.transaction.discountAmount === exp2 && r2.json.transaction.discountPercent === 12.5, `${r2.json.transaction.discountAmount} vs ${exp2}`)
  }

  // ---- TEST 3: diskon nominal lama (Rp) tetap jalan ----
  const r3 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: 1 }],
    discountAmount: 1000,
    paymentMethod: 'CASH',
    paidAmount: 10_000_000,
  })
  check('diskon Rp manual tetap bekerja', r3.status === 201 && r3.json.transaction.discountAmount === 1000 && r3.json.transaction.discountPercent === 0, `HTTP ${r3.status}`)

  // ---- TEST 4: persen invalid ditolak ----
  const r4 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: 1 }],
    discountPercent: 150,
    paymentMethod: 'CASH',
    paidAmount: 10_000_000,
  })
  check('persen > 100 ditolak 422', r4.status === 422, `HTTP ${r4.status}`)

  // ---- TEST 5: 3 desimal ditolak ----
  const r5 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: 1 }],
    discountPercent: 10.555,
    paymentMethod: 'CASH',
    paidAmount: 10_000_000,
  })
  check('persen 3 desimal ditolak 422', r5.status === 422, `HTTP ${r5.status}`)

  console.log(failures === 0 ? '\nSEMUA TEST LULUS ✔' : `\n${failures} TEST GAGAL ✘`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
