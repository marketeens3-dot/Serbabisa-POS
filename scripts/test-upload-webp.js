// Test upload logo: file > 300KB harus berhasil dikompres otomatis (<= 300KB, WebP/PNG).
// 1) generate PNG besar (berisik agar sulit dikompres, >1MB)
// 2) login -> cookie sesi
// 3) POST /api/upload
// 4) lapankan ukuran input vs output
const { execSync } = require('child_process')
const sharp = require('sharp')

const BASE = 'http://localhost:3000'
const OUT = '/home/z/my-project/scripts/tmp-logo-test'

async function makeBigPng() {
  // RGB noise kripto-acak 2400x2400 -> PNG beberapa MB (worst case untuk kompresor)
  const w = 1600, h = 1600
  const channels = 3
  const { randomBytes } = require('crypto')
  const buf = randomBytes(w * h * channels)
  const png = await sharp(buf, { raw: { width: w, height: h, channels } }).png().toFile(`${OUT}-big.png`)
  console.log(`[test] input PNG: ${png.width}x${png.height}, ${(png.size / 1024 / 1024).toFixed(2)} MB`)
  return png.size
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ email: 'kasir@demo.local', password: 'Kasir#2026' }),
  })
  const setCookie = res.headers.getSetCookie?.() ?? []
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ')
  if (!res.ok || !cookie) throw new Error(`login gagal: ${res.status} ${await res.text()}`)
  console.log(`[test] login OK (kasir@demo.local)`)
  return cookie
}

async function upload(cookie, path) {
  const fs = require('fs')
  const blob = new Blob([fs.readFileSync(path)], { type: 'image/png' })
  const form = new FormData()
  form.append('file', blob, 'logo.png')
  const res = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { cookie, 'sec-fetch-site': 'same-origin' },
    body: form,
  })
  const body = await res.json()
  return { status: res.status, body }
}

;(async () => {
  const inSize = await makeBigPng()
  const cookie = await login()
  const { status, body } = await upload(cookie, `${OUT}-big.png`)
  if (status !== 200) {
    console.error(`[test] GAGAL: HTTP ${status}:`, JSON.stringify(body))
    process.exit(1)
  }
  const dataUrl = body.logoUrl || ''
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl)
  if (!m) { console.error('[test] GAGAL: respons bukan data URL valid'); process.exit(1) }
  const outBytes = Buffer.from(m[2], 'base64').length
  console.log(`[test] output: ${m[1]}, ${(outBytes / 1024).toFixed(1)} KB`)
  if (outBytes > 300 * 1024) { console.error('[test] GAGAL: output > 300KB'); process.exit(1) }
  const saved = (100 - (outBytes / inSize) * 100).toFixed(1)
  console.log(`[test] SUKSES ✔ input ${(inSize/1024/1024).toFixed(2)}MB → output ${(outBytes/1024).toFixed(1)}KB (${saved}% hemat)`)
  // sanity: buffer PNG juga diterima, file kecil tetap jalan
  const small = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 30, g: 120, b: 200, alpha: 1 } } }).png().toBuffer()
  require('fs').writeFileSync(`${OUT}-small.png`, small)
  const r2 = await upload(cookie, `${OUT}-small.png`)
  console.log(`[test] sanity file kecil: HTTP ${r2.status} (${r2.body.logoUrl ? 'OK' : JSON.stringify(r2.body)})`)
  process.exit(r2.status === 200 ? 0 : 1)
})().catch((e) => { console.error('[test] ERROR:', e.message); process.exit(1) })
