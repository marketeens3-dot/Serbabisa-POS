// Test fitur DISKON PRODUK (master) + DISKON PER ITEM (keranjang):
// 1) PATCH produk: harga 9500 → diskon 2500 (valid); diskon >= harga ditolak
// 2) Checkout 1 unit → subtotal baris NET 7000, diskon item 2500 tersimpan
// 3) Checkout qty 2 → diskon 5000 (per unit × qty), total rekon
// 4) Override per item: pct 10 → floor(gross × 10%)
// 5) Override per item: Rp manual, clamp ke gross bila lebih besar
// 6) Kombinasi diskon item + diskon transaksi 10% (basis NET)
// 7) Item tanpa diskon tetap backward compatible
// Cleanup: kembalikan diskon produk ke nilai semula + status transaksi demo.
const BASE = 'http://localhost:3000'

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email: 'kasir@demo.local', password: 'Kasir#2026' }),
  })
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!res.ok) throw new Error(`login gagal: ${res.status}`)
  return cookie
}

async function getCatalog(cookie) {
  const res = await fetch(`${BASE}/api/catalog?status=ACTIVE&pageSize=50`, { headers: { cookie } })
  const json = await res.json()
  return json.data
}

async function patchItem(cookie, id, body) {
  const res = await fetch(`${BASE}/api/catalog/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
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
  const catalog = await getCatalog(cookie)
  const item = catalog.find((i) => i.type === 'PRODUCT' && i.stockQty >= 5)
  if (!item) throw new Error('tidak ada produk dengan stok cukup')
  const originalDiscount = item.discountAmount ?? 0
  console.log(`produk uji: ${item.name} — harga ${item.sellingPrice}, stok ${item.stockQty}, diskon awal ${originalDiscount}`)

  // ---- TEST 1: set diskon produk 9500 → 2500 (pakai harga aktual) ----
  const price = item.sellingPrice >= 3000 ? 9500 : item.sellingPrice // contoh user: 9500
  const disc = 2500
  const p1 = await patchItem(cookie, item.id, {
    type: item.type, name: item.name, sellingPrice: price, discountAmount: disc,
    stockQty: item.stockQty, unit: item.unit, isActive: true,
  })
  check('PATCH produk set diskon 2500 dari harga 9500', p1.status === 200, `status ${p1.status}`)
  check('DTO produk mengembalikan discountAmount', p1.json?.discountAmount === disc, `got ${p1.json?.discountAmount}`)
  const catAfter = (await getCatalog(cookie)).find((i) => i.id === item.id)
  check('diskon produk tersimpan (GET katalog)', catAfter?.discountAmount === disc, `got ${catAfter?.discountAmount}`)

  // ---- TEST 1b: diskon >= harga jual ditolak ----
  const p2 = await patchItem(cookie, item.id, {
    type: item.type, name: item.name, sellingPrice: price, discountAmount: price,
    stockQty: item.stockQty, unit: item.unit, isActive: true,
  })
  check('diskon == harga jual ditolak 400/422', p2.status >= 400, `status ${p2.status}`)

  // ---- TEST 2: checkout 1 unit — harga jadi 7000 ----
  // (kasir menginisialisasi diskon baris dari master produk lalu mengirim
  //  nominal efektifnya — sama seperti perilaku UI)
  const c1 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: 1, discountAmount: disc }],
    paymentMethod: 'CASH', paidAmount: 999999,
    idempotencyKey: `discprod-t2-${Date.now()}`,
  })
  const t1 = c1.json?.transaction
  check('checkout 1 unit sukses 201', c1.status === 201, `status ${c1.status}`)
  check('subtotal baris NET = harga − diskon', t1?.subtotal === price - disc, `subtotal ${t1?.subtotal} (harapan ${price - disc})`)
  check('item discountAmount tersimpan', t1?.items?.[0]?.discountAmount === disc, `got ${t1?.items?.[0]?.discountAmount}`)
  check('total = subtotal (tanpa diskon transaksi)', t1?.totalAmount === t1?.subtotal)

  // ---- TEST 3: qty 2 — diskon per unit × qty ----
  const c2 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: 2, discountAmount: disc * 2 }],
    paymentMethod: 'CASH', paidAmount: 999999,
    idempotencyKey: `discprod-t3-${Date.now()}`,
  })
  const t2 = c2.json?.transaction
  const expectDisc2 = disc * 2
  check('checkout qty 2 sukses', c2.status === 201)
  check('diskon item = 2500 × 2 = 5000', t2?.items?.[0]?.discountAmount === expectDisc2, `got ${t2?.items?.[0]?.discountAmount}`)
  check('subtotal = gross − 5000', t2?.subtotal === price * 2 - expectDisc2, `subtotal ${t2?.subtotal}`)
  check('totalAmount rekon', t2?.totalAmount === t2?.subtotal - t2?.discountAmount + t2?.taxAmount)

  // ---- TEST 4: override per item — persen 10% ----
  const c3 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: 1, discountPercent: 10 }],
    paymentMethod: 'CASH', paidAmount: 999999,
    idempotencyKey: `discprod-t4-${Date.now()}`,
  })
  const t3 = c3.json?.transaction
  const expectPctDisc = Math.floor((price * 10) / 100)
  check('override % menang atas diskon produk', t3?.items?.[0]?.discountAmount === expectPctDisc, `got ${t3?.items?.[0]?.discountAmount}, harapan ${expectPctDisc}`)

  // ---- TEST 5: override Rp manual melebihi harga → clamp ke gross ----
  const c4 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: 1, discountAmount: 999999 }],
    paymentMethod: 'CASH', paidAmount: 999999,
    idempotencyKey: `discprod-t5-${Date.now()}`,
  })
  const t4 = c4.json?.transaction
  check('Rp manual di-clamp ke harga baris', t4?.items?.[0]?.discountAmount === price && t4?.subtotal === 0, `disc ${t4?.items?.[0]?.discountAmount}, subtotal ${t4?.subtotal}`)

  // ---- TEST 6: diskon item + diskon transaksi 10% (basis NET) ----
  const gross2 = price * 2
  const itemDisc2 = disc * 2
  const net2 = gross2 - itemDisc2
  const txDisc = Math.floor((net2 * 10) / 100)
  const c5 = await checkout(cookie, {
    items: [{ catalogItemId: item.id, quantity: 2, discountAmount: itemDisc2 }],
    discountPercent: 10,
    paymentMethod: 'CASH', paidAmount: 999999,
    idempotencyKey: `discprod-t6-${Date.now()}`,
  })
  const t5 = c5.json?.transaction
  check('kombinasi: diskon transaksi dari subtotal NET', t5?.discountAmount === txDisc, `got ${t5?.discountAmount}, harapan ${txDisc}`)
  check('kombinasi: total rekon', t5?.totalAmount === net2 - txDisc, `total ${t5?.totalAmount}, harapan ${net2 - txDisc}`)

  // ---- TEST 7: item TANPA diskon (produk lain) tetap kompatibel ----
  const other = catalog.find((i) => i.id !== item.id)
  if (other) {
    const c6 = await checkout(cookie, {
      items: [{ catalogItemId: other.id, quantity: 1 }],
      paymentMethod: 'CASH', paidAmount: 999999,
      idempotencyKey: `discprod-t7-${Date.now()}`,
    })
    const t6 = c6.json?.transaction
    check('item tanpa diskon: subtotal = qty × harga', t6?.subtotal === other.sellingPrice && t6?.items?.[0]?.discountAmount === 0, `subtotal ${t6?.subtotal}`)
  }

  // ---- CLEANUP: kembalikan diskon produk & harga semula ----
  await patchItem(cookie, item.id, {
    type: item.type, name: item.name,
    sellingPrice: item.sellingPrice, discountAmount: originalDiscount,
    stockQty: item.stockQty, unit: item.unit, isActive: true,
  })
  console.log(`cleanup: produk dikembalikan (harga ${item.sellingPrice}, diskon ${originalDiscount})`)

  console.log(`\n${failures === 0 ? 'SEMUA TES LULUS' : failures + ' TES GAGAL'}`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
