// Browser E2E: tombol "Unduh Nota (JPG)" — layar sukses checkout + detail transaksi.
// 1) login kasir  2) POS tambah 2 item  3) checkout tunai  4) klik Unduh Nota (JPG)
// 5) validasi file terunduh (nama, format JPEG, dimensi, ukuran) via sharp
// 6) buka detail transaksi terakhir → klik Unduh JPG → validasi lagi
// 7) screenshot layar
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const BASE = 'http://localhost:3000'
const OUT = '/home/z/my-project/download'
let pass = 0, fail = 0
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (ok) pass++; else fail++ }

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  // Login
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', 'kasir@demo.local')
  await page.fill('input[type="password"]', process.env.DEMO_KASIR_PASSWORD ?? '')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/app**', { timeout: 30000 })
  await page.waitForLoadState('networkidle')

  // POS — SPA hash router
  await page.goto(`${BASE}/#/app/pos`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  // Tambah 2 item pertama
  const cards = page.locator('button[aria-label^="Tambah "]')
  await cards.nth(0).click()
  await page.waitForTimeout(400)
  await cards.nth(1).click()
  await page.waitForTimeout(500)

  // Checkout tunai
  await page.locator('button:has-text("Bayar")').first().click()
  await page.waitForTimeout(800)
  const exactBtn = page.locator('[role="dialog"] button:has-text("Uang pas")')
  if (await exactBtn.count()) await exactBtn.click()
  else await page.fill('#paid', '100000')
  await page.waitForTimeout(400)
  await page.locator('[role="dialog"] button[type="submit"]').first().click()
  await page.waitForTimeout(2500)

  // ---- Layar sukses: tombol Unduh Nota (JPG) ----
  const dlBtn = page.locator('button:has-text("Unduh Nota (JPG)")')
  check((await dlBtn.count()) > 0, 'layar sukses menampilkan tombol "Unduh Nota (JPG)"')
  await page.screenshot({ path: `${OUT}/jpg-success-screen.png` })

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    dlBtn.click(),
  ])
  const fname = download.suggestedFilename()
  check(/^Nota-.+\.jpg$/.test(fname), `nama file unduhan: ${fname}`)

  const saved = path.join(OUT, 'nota-unduhan-e2e.jpg')
  await download.saveAs(saved)
  const meta = await sharp(saved).metadata()
  const sizeKb = fs.statSync(saved).size / 1024
  check(meta.format === 'jpeg', `format file JPEG (dapat: ${meta.format})`)
  check(meta.width >= 300 && meta.height >= 300, `dimensi wajar: ${meta.width}x${meta.height}px`)
  check(sizeKb > 5, `ukuran wajar: ${sizeKb.toFixed(1)} KB`)

  // ---- Detail transaksi: tombol Unduh JPG ----
  await page.locator('button:has-text("Transaksi Baru")').click()
  await page.waitForTimeout(1200)
  await page.goto(`${BASE}/#/app/transactions`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const firstLink = page.locator('a[href^="#/app/transactions/"]').first()
  check((await firstLink.count()) > 0, 'riwayat transaksi memiliki tautan detail')
  await firstLink.click()
  await page.waitForTimeout(2000)

  const dlBtn2 = page.locator('button:has-text("Unduh JPG")')
  check((await dlBtn2.count()) > 0, 'detail transaksi menampilkan tombol "Unduh JPG"')
  await page.screenshot({ path: `${OUT}/jpg-detail-screen.png` })

  const [download2] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    dlBtn2.first().click(),
  ])
  const fname2 = download2.suggestedFilename()
  check(/^Nota-.+\.jpg$/.test(fname2), `nama file unduhan ke-2: ${fname2}`)
  const saved2 = path.join(OUT, 'nota-unduhan-e2e-2.jpg')
  await download2.saveAs(saved2)
  const meta2 = await sharp(saved2).metadata()
  check(meta2.format === 'jpeg', `format file ke-2 JPEG (dapat: ${meta2.format})`)
  check(meta2.width >= 300, `dimensi ke-2: ${meta2.width}x${meta2.height}px`)

  check(errors.length === 0, `tanpa console/page error (dapat: ${errors.length}) ${errors.slice(0, 3).join(' | ')}`)

  console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`)
  await browser.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('FATAL:', e); process.exit(1) })
