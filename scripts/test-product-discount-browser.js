// Browser E2E: diskon produk (master) + diskon tetap (pin) + struk.
// Alur: set diskon produk via API → kartu kasir tampil harga coret → masuk
// keranjang (diskon otomatis) → pin diskon transaksi 10% → checkout → cek
// layar sukses & nota → transaksi baru: pin bertahan → reload: pin bertahan.
const { chromium } = require('playwright')

const BASE = 'http://localhost:3000'
const SHOT = (n) => `/home/z/my-project/download/${n}.png`

async function apiLogin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email: 'kasir@demo.local', password: 'Kasir#2026' }),
  })
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
}

let failures = 0
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failures++
}

;(async () => {
  // ---------- SETUP via API: produk "Air Mineral 600ml" diskon 1500 ----------
  const cookie = await apiLogin()
  const catRes = await fetch(`${BASE}/api/catalog?status=ACTIVE&pageSize=50`, { headers: { cookie } })
  const catalog = (await catRes.json()).data
  const target = catalog.find((i) => i.name.includes('Air Mineral') && i.type === 'PRODUCT')
  if (!target) throw new Error('produk Air Mineral tidak ditemukan')
  const patch = await fetch(`${BASE}/api/catalog/${target.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({
      type: target.type, name: target.name, sellingPrice: target.sellingPrice,
      discountAmount: 1500, stockQty: target.stockQty, unit: target.unit, isActive: true,
    }),
  })
  if (!patch.ok) throw new Error(`PATCH gagal: ${patch.status}`)
  const price = target.sellingPrice
  console.log(`setup: ${target.name} harga ${price} → diskon 1500 (jadi ${price - 1500})`)

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  // ---------- LOGIN ----------
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear()) // mulai bersih (tanpa pin/parkiran lama)
  await page.reload({ waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'kasir@demo.local')
  await page.fill('input[type="password"]', 'Kasir#2026')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/app**', { timeout: 30000 })
  await page.goto(`${BASE}/#/app/pos`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  // ---------- 1. KARTU KATALOG: harga efektif + coret ----------
  const card = page.locator(`button[aria-label*="${target.name}"]`).first()
  const cardLabel = await card.getAttribute('aria-label')
  check('kartu kasir: aria-label memuat harga diskon', cardLabel.includes(`diskon dari ${'Rp ' + price.toLocaleString('id-ID')}`), cardLabel)
  const cardText = await card.innerText()
  check('kartu kasir: harga efektif tampil', cardText.includes((price - 1500).toLocaleString('id-ID')), cardText.replace(/\n/g, ' | '))
  await page.screenshot({ path: SHOT('pd-catalog') })

  // ---------- 2. MASUK KERANJANG — diskon produk otomatis ----------
  await card.click()
  await page.waitForTimeout(600)
  const cartTab = page.locator('#pos-tab-cart')
  if (await cartTab.count()) await cartTab.click().catch(() => {})
  await page.waitForTimeout(500)
  const lineText = await page.locator('ul.divide-y li').first().innerText()
  check('keranjang: harga satuan efektif (coret harga asli)', lineText.includes((price - 1500).toLocaleString('id-ID')) && lineText.includes(price.toLocaleString('id-ID')), lineText.replace(/\n/g, ' | '))
  check('keranjang: catatan diskon −Rp 1.500', lineText.includes('1.500'), '')
  // tambah item kedua (tanpa diskon produk)
  await page.locator('#pos-tab-catalog').click().catch(() => {})
  await page.waitForTimeout(400)
  const other = catalog.find((i) => i.id !== target.id && i.type === 'PRODUCT' && (i.discountAmount ?? 0) === 0)
  if (other) {
    await page.locator(`button[aria-label*="${other.name}"]`).first().click()
    await page.waitForTimeout(500)
  }
  await page.locator('#pos-tab-cart').click().catch(() => {})
  await page.waitForTimeout(400)

  // ---------- 3. DISKON TRANSAKSI 10% + PIN "TETAP" ----------
  await page.click('button:has-text("%")')
  await page.locator('input[aria-label="Diskon dalam persen"]').fill('10')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Diskon tetap' }).click()
  await page.waitForTimeout(400)
  const pinPressed = await page.getByRole('button', { name: 'Diskon tetap' }).getAttribute('aria-pressed')
  check('tombol Tetap aktif (aria-pressed=true)', pinPressed === 'true')
  const summaryText = await page.locator('body').innerText()
  check('ringkasan: baris "Diskon item" tampil', summaryText.includes('Diskon item'))
  check('ringkasan: label "Diskon transaksi (10%)"', summaryText.includes('Diskon transaksi (10%)'))
  await page.screenshot({ path: SHOT('pd-cart') })

  // ---------- 4. CHECKOUT ----------
  await page.locator('button:has-text("Bayar")').first().click()
  await page.waitForTimeout(800)
  const dlg = page.locator('[role="dialog"]')
  const dlgText = await dlg.innerText()
  check('dialog bayar: menyebut Diskon item', dlgText.includes('Diskon item'))
  const exactBtn = dlg.locator('button:has-text("Uang pas")')
  if (await exactBtn.count()) await exactBtn.click()
  else await page.fill('#paid', '999999')
  await page.waitForTimeout(300)
  await dlg.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(2200)

  // ---------- 5. LAYAR SUKSES + NOTA ----------
  const successText = await page.locator('body').innerText()
  check('layar sukses: baris "Diskon item"', successText.includes('Diskon item'))
  check('layar sukses: baris "Diskon toko (10%)"', successText.includes('Diskon toko (10%)'))
  const nota = page.locator('.invoice-render').first()
  if (await nota.count()) {
    const notaText = await nota.innerText()
    check('NOTA: baris "Diskon 10%" per item', notaText.includes('Diskon 10%'))
    check('NOTA: baris "Diskon item"', notaText.includes('Diskon item'))
    check('NOTA: baris "Diskon toko 10%"', notaText.includes('Diskon toko 10%'))
    await nota.screenshot({ path: SHOT('pd-struk') })
    console.log('screenshot struk: download/pd-struk.png')
  } else {
    check('elemen nota ditemukan', false)
  }
  await page.screenshot({ path: SHOT('pd-success') })

  // ---------- 6. TRANSAKSI BARU — pin diskon bertahan ----------
  await page.locator('button:has-text("Transaksi Baru")').click()
  await page.waitForTimeout(800)
  const pinAfter = await page.getByRole('button', { name: 'Diskon tetap' }).getAttribute('aria-pressed')
  const discVal = await page.locator('input[aria-label="Diskon dalam persen"]').inputValue()
  check('transaksi baru: diskon 10% masih terpasang', discVal === '10', `input=${discVal}`)
  check('transaksi baru: pin masih aktif', pinAfter === 'true')

  // ---------- 7. RELOAD — pin bertahan dari localStorage ----------
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const pinReload = await page.getByRole('button', { name: 'Diskon tetap' }).getAttribute('aria-pressed')
  const discReload = await page.locator('input[aria-label="Diskon dalam persen"]').inputValue()
  check('setelah reload: diskon 10% dipulihkan', discReload === '10', `input=${discReload}`)
  check('setelah reload: pin masih aktif', pinReload === 'true')

  // ---------- CLEANUP: reset diskon produk ----------
  await fetch(`${BASE}/api/catalog/${target.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({
      type: target.type, name: target.name, sellingPrice: target.sellingPrice,
      discountAmount: 0, stockQty: target.stockQty, unit: target.unit, isActive: true,
    }),
  })
  console.log('cleanup: diskon produk direset ke 0')

  console.log(`console errors: ${errors.length}${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`)
  await browser.close()
  console.log(`\n${failures === 0 && errors.length === 0 ? 'SEMUA TES LULUS' : failures + ' TES GAGAL'}`)
  process.exit(failures === 0 && errors.length === 0 ? 0 : 1)
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
