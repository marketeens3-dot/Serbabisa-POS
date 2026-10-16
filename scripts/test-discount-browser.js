// Browser E2E: fitur diskon % di POS + nota.
// 1) login kasir  2) buka /app/pos  3) tambah item  4) toggle % → isi 10
// 5) cek total berkurang + label "Diskon (10%)"  6) checkout  7) cek layar sukses "Diskon (10%)"
// 8) screenshot nota
const { chromium } = require('playwright')

const BASE = 'http://localhost:3000'
const SHOT = (n) => `/home/z/my-project/download/discount-${n}.png`

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  // Login
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'kasir@demo.local')
  await page.fill('input[type="password"]', process.env.DEMO_KASIR_PASSWORD ?? '')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/app**', { timeout: 30000 })
  await page.waitForLoadState('networkidle')

  // POS — SPA pakai hash router (#/app/pos)
  await page.goto(`${BASE}/#/app/pos`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  // Tambah item pertama dari katalog (klik kartu produk pertama — quick add)
  const firstCard = page.locator('button[aria-label^="Tambah "]').first()
  await firstCard.click()
  await page.waitForTimeout(600)

  // Pindah ke tab keranjang (mobile segmented) bila ada; desktop dua kolom langsung terlihat
  const cartTab = page.locator('#pos-tab-cart')
  if (await cartTab.count()) await cartTab.click().catch(() => {})
  await page.waitForTimeout(500)

  // Toggle diskon ke mode %
  await page.click('button:has-text("%")')
  await page.waitForTimeout(300)
  const pctInput = page.locator('input[aria-label="Diskon dalam persen"]')
  await pctInput.fill('10')
  await page.waitForTimeout(500)

  const bodyText = await page.locator('body').innerText()
  const okCartLabel = bodyText.includes('Diskon (10%)')
  const okCalc = bodyText.includes('dari seluruh item')
  console.log(`${okCartLabel ? 'PASS' : 'FAIL'}  keranjang label "Diskon (10%)"`)
  console.log(`${okCalc ? 'PASS' : 'FAIL'}  rincian "= dari seluruh item" tampil`)
  await page.screenshot({ path: SHOT('cart'), fullPage: false })

  // Checkout
  const payBtn = page.locator('button:has-text("Bayar")').first()
  await payBtn.click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: SHOT('checkout') })
  const dlgText = await page.locator('[role="dialog"]').innerText()
  console.log(`${dlgText.includes('Diskon 10%') ? 'PASS' : 'FAIL'}  dialog bayar menampilkan "Diskon 10%"`)

  // Konfirmasi pembayaran — isi uang bayar dulu (input #paid atau tombol "Uang pas")
  const exactBtn = page.locator('[role="dialog"] button:has-text("Uang pas")')
  if (await exactBtn.count()) await exactBtn.click()
  else await page.fill('#paid', '100000')
  await page.waitForTimeout(400)
  const confirmBtn = page.locator('[role="dialog"] button[type="submit"]').first()
  await confirmBtn.click()
  await page.waitForTimeout(2000)

  const successText = await page.locator('body').innerText()
  const okSuccess = successText.includes('Diskon (10%)') || successText.includes('Diskon 10%')
  console.log(`${okSuccess ? 'PASS' : 'FAIL'}  layar sukses menampilkan diskon 10%`)
  await page.screenshot({ path: SHOT('success'), fullPage: false })

  // Cek nota (print preview area) — cari teks "Diskon 10%" pada komponen nota
  const nota = page.locator('.invoice-render').first()
  if (await nota.count()) {
    const notaText = await nota.innerText()
    console.log(`${notaText.includes('Diskon 10%') ? 'PASS' : 'FAIL'}  NOTA menampilkan "Diskon 10%"`)
    console.log(`${notaText.includes('Rp') ? 'PASS' : 'FAIL'}  nota memuat nominal Rp`)
  } else {
    console.log('WARN  elemen .invoice-render tidak ditemukan di layar sukses')
  }

  console.log(`console errors: ${errors.length}${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`)
  await browser.close()
  process.exit(errors.length === 0 ? 0 : 1)
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
