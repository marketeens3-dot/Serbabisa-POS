# Serbabisa — SaaS POS Multi-Tenant

Aplikasi Point-of-Sale (POS) multi-tenant untuk UMKM Indonesia: kasir, katalog produk/jasa,
pelanggan, nota cetak & WhatsApp, laporan, dan admin multi-toko. UI Bahasa Indonesia
(locale `id-ID`, timezone `Asia/Jakarta`, format `Rp`, `DD/MM/YYYY`, 24 jam).

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles.
> Dokumen ini bukan pernyataan sertifikasi. Lihat bagian Disclaimer.

## Stack

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 strict |
| UI | Tailwind CSS 4, shadcn/ui, lucide-react, sonner, next-themes (dark/light) |
| Data | Prisma 6 + **PostgreSQL (Supabase)**, Zod 4, react-hook-form |
| Desktop | **Electron 44** + electron-builder 26 → installer NSIS & portable `.exe` |
| Offline | **Local-first**: runtime desktop memakai **SQLite** lokal, sinkron ke Supabase |
| Deploy | **Vercel** (serverless) + Supabase (connection pooler) · **Windows .exe** (opsional) |

> **Windows (dev & desktop).** Turbopack gagal membuat junction point untuk `@prisma/client`
> di Windows, jadi `next dev` dan `next build` untuk paket desktop memakai `--webpack`
> (`npm run dev:win`). `node_modules` juga harus berisi binding native Windows
> (`lightningcss-win32-*`, `@tailwindcss/oxide-win32-*`, `@img/sharp-win32-x64`) — jalankan
> `npm install` di Windows bila hasil install di Linux/macOS.

> **Package manager bebas.** Semua perintah memakai `npm run …`, dan skrip operasionalnya
> berjalan di Node murni (>= 22.18) — Bun tidak lagi menjadi syarat. `bun install` tetap
> berfungsi, hanya tidak dibutuhkan lagi. Lockfile yang tersimpan adalah `bun.lock`, jadi
> `bun install` memberi hasil yang paling reproducible; `npm install` tetap bisa dipakai
> kalau Bun tidak tersedia, hanya tidak menghasilkan lockfile.

## Menjalankan

```bash
npm install
cp .env.example .env      # isi DATABASE_URL
npm run db:push           # sinkronkan skema
npm run seed              # data demo
npm run dev               # http://localhost:3000  (Windows: npm run dev:win)
```

### Desktop Windows — bisa offline

Aplikasi `.exe` berjalan **local-first**: seluruh POS membaca & menulis ke SQLite lokal, jadi
**berjalan penuh tanpa internet**. Supabase menjadi salinan bersama antar perangkat dan
dijalankan sinkron otomatis tiap 5 menit saat ada koneksi.

```bash
npm run desktop:dist      # → release/Serbabisa-POS-1.0.0-{Setup,Portable}.exe
```

- Nomor nota tetap `INV-YYYY-NNNNNN` dan **tidak pernah bentrok** meski beberapa kasir
  berjualan offline (alokasi blok nomor per perangkat).
- Aktivasi pertama butuh internet **satu kali**; setelah itu login offline tersedia.
- Modul **Super Admin tetap online-only** (butuh data lintas-toko).

Detail arsitektur, uji, dan batasan: **[DESKTOP.md](DESKTOP.md)**.

### Aplikasi HP (Android + iOS)

Aplikasi mobile di folder `mobile/`, dibuat dengan Expo. Local-first
seperti versi desktop: kasir tetap bisa berjualan tanpa internet, dan
penjualan yang tertunda otomatis dikirim ke server begitu ada koneksi.

```bash
cd mobile
npm install
npm run android       # atau: npm run ios  (butuh macOS)
```

Semuanya **client murni** di atas API yang sudah ada — Expo Go tidak bisa
menjalankan server Node.js, jadi tidak ada Prisma/Next.js di dalam aplikasi HP.

- Alamat server bisa diganti dari layar masuk, jadi tiap toko bisa memakai
  server sendiri tanpa build ulang.
- Login memakai token yang dikembalikan server khusus untuk klien native,
  karena cookie `HttpOnly` tidak bisa dibaca React Native.
- Penjualan offline yang gagal naik **tidak dihapus diam-diam**;
  ditampilkan di Pengaturan dengan alasannya.
- Kalau harga berubah saat perangkat offline, server menolak transaksi dengan
  pesan yang bisa ditindaklanjuti, bukan menyimpannya dengan angka lain.

> Expo Go hanya untuk pengembangan. Untuk distribusi ke kasir, pakai
> `eas build` (development build).

Detail arsitektur, cara kerja, dan batasan: **[MOBILE.md](MOBILE.md)**.

## Arsitektur

```
Browser ─ SPA pada route "/" (hash routing #/app/*, #/admin/*)
   │  fetch JSON + cookie httpOnly "sb_session" (sameSite=lax)
   ▼
Next.js Route Handlers /api/*  (Zod validation, requireUser/requireSuperAdmin,
   │   assertSameOrigin, rate-limit, audit)
   ▼
Service layer — tenantId SELALU diturunkan dari session (bukan input client)
   │  Prisma Client (query parameterized) — semua query WHERE tenantId
   ▼
PostgreSQL @ Supabase (User, Session, Tenant, Category, CatalogItem, Customer,
   Transaction, TransactionItem, InvoiceCounter, InvoiceTemplate,
   InventoryMovement, AuditLog, SystemSetting)
```

- **Uang = Int** (rupiah tanpa subunit) → bebas floating point. **Quantity = Float** (3 desimal).
- Checkout atomic dalam `db.$transaction`; void = status `VOID` + restock (bukan delete).
- Nomor invoice `INV-YYYY-NNNNNN` dari counter upsert atomic, unik per tenant.

## Isolasi Tenant (application-layer)

Isolasi antar toko dilakukan di **service layer** (equivalen kontrol RLS):

| Kontrol | Implementasi |
|---|---|
| Isolasi data tenant | SEMUA query `WHERE tenantId` yang diturunkan dari session server-side; IDOR → 404 |
| Auth | scrypt hashing (Node crypto); session token random disimpan sebagai sha256 hash; cookie httpOnly |
| Akses admin | `requireSuperAdmin` — upaya akses admin dari USER → 403 + audit `ROLE_CHANGE_ATTEMPT` |

Isolasi tenant **tidak pernah bergantung pada frontend** — diverifikasi via QA browser
(user tenant lain melihat 0 data; IDOR → 404; admin API dari USER → 403).

## Struktur Project

```
prisma/schema.prisma        Skema kanonik (PostgreSQL)
prisma/schema.sqlite.prisma Skema SQLite (GENERATED, jangan diedit)
prisma/seed.ts              Data demo (idempotent)
scripts/bootstrap-super-admin.ts   Buat super admin dari env
scripts/backup-db.sh        Backup pg_dump produksi (gzip + retensi + verifikasi)
scripts/db-size-report.ts   Laporan ukuran & proyeksi kuota DB
scripts/prune-audit.ts      Housekeeping audit_logs & sesi expired (dry-run default)
scripts/review.mjs          Uji 61 pemeriksaan: uang, stok, tenant, keamanan, concurrency
src/lib/                    auth, api, audit, validation, rate-limit, whatsapp, invoice, format
src/app/api/                Route handlers (auth, admin, user, transaksi, export, dll.)
src/app/api/sync/mobile/    Endpoint untuk klien native (ping + bootstrap)
src/components/app/         AppShell SPA + hash router
src/components/user/        POS, produk, pelanggan, transaksi, nota, laporan, pengaturan
src/components/admin/       Users, tenants, audit, settings
src/lib/sync/               Mesin sinkronisasi local ke cloud (engine, entities, bootstrap)
electron/                   Shell desktop: main.cjs, preload, ipc, config, dialog koneksi
electron-builder.yml        Target win: nsis (installer) + portable
mobile/                     Aplikasi HP (Expo / React Native, local-first)
mobile/scripts/check-expo-go.mjs  Tolak dependensi di luar Expo Go
scripts/build-desktop.mjs   Rakit paket server standalone + default-config.json
scripts/generate-sqlite-schema.mjs  Turunkan skema SQLite dari skema PostgreSQL
scripts/make-icon.mjs       Bentuk build/icon.ico dari public/icon-512.png
scripts/test-offline.mjs    Uji 14 pemeriksaan tanpa internet sama sekali
scripts/test-sync.mjs       Uji 21 pemeriksaan: 2 kasir offline → sinkron
DESKTOP.md                  Panduan lengkap build, offline, & distribusi .exe
MOBILE.md                   Panduan aplikasi HP: Expo Go, offline, dan batasan
```

## Setup Lokal (Supabase)

```bash
npm install
cp .env.example .env      # isi DATABASE_URL (lihat catatan koneksi di bawah)
npm run db:push           # sinkronkan skema ke PostgreSQL
npm run seed              # data demo (idempotent)
npm run dev               # http://localhost:3000
```

### String koneksi Supabase — pilih yang benar

| Konteks | Gunakan | Alasan |
|---|---|---|
| `db:push` / `seed` / migrasi (DDL) | **Session pooler** `...pooler.supabase.com:5432` | Mendukung DDL + prepared statements; IPv4-friendly |
| Vercel / serverless (runtime) | **Transaction pooler** `...pooler.supabase.com:6543` + `?pgbouncer=true&connection_limit=1` | Serverless membuka banyak koneksi paralel; transaction pooler aman |

> ⚠️ Karakter khusus di password **wajib** di-percent-encode (mis. `@` → `%40`).

Kredensial demo dari seed — **DEVELOPMENT ONLY, ganti sebelum production**:

| Peran | Email | Password |
|---|---|---|
| SUPER_ADMIN | `admin@serbabisa.local` | `Serbabisa#2026` |
| USER (Kasir) | `kasir@demo.local` | `Kasir#2026` |

Override via env saat seed: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `DEMO_KASIR_PASSWORD`.

## Deploy ke Vercel (langkah demi langkah)

1. **Fork/push repo ini ke GitHub** (sudah termasuk konfigurasi Vercel-ready).
2. Di Vercel: **Add New → Project → Import** repo GitHub ini. Framework auto-deteksi
   Next.js (build `next build`, install otomatis menjalankan `prisma generate` via
   `postinstall`).
3. **Environment Variables** (Project → Settings → Environment Variables) — set
   untuk Production + Preview:
   - `DATABASE_URL` = string **transaction pooler**:
     `postgresql://postgres.<ref>:<password-encoded>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
   - (tidak ada env lain yang dibutuhkan aplikasi)
4. **Deploy**. Setelah selesai, inisialisasi database (sekali saja, dari lokal):
   ```bash
   DATABASE_URL="<session-pooler-url>" npm run db:push
   DATABASE_URL="<session-pooler-url>" SUPER_ADMIN_PASSWORD="<password-kuat>" npm run seed
   ```
5. **Segera ganti password** super admin & kasir demo setelah login pertama
   (Pengaturan → profil → ganti password).

Catatan: Hobby plan Vercel = ToS non-komersial — untuk bisnis, gunakan Pro.
Region function terdekat dengan DB (ap-southeast-1) disarankan (mis. `sin1`).

## Perintah

`npm run dev` · `npm run lint` · `npm run typecheck` · `npm run db:check` · `npm run db:push` ·
`npm run seed` · `npm run bootstrap-admin` · `npm run db:prune` · `npm run db:size` ·
`npm run db:backup` *(butuh `bash` — Git Bash di Windows)*

Skrip `.ts` berjalan di Node (>= 22.18) dan tidak butuh Bun. `db:backup` tetap
berbasis `bash` karena isinya `pg_dump` + `gzip` + retensi.

Desktop Windows (lihat [DESKTOP.md](DESKTOP.md)):

`npm run desktop:dist` · `npm run desktop:pack` · `npm run desktop:prepare` ·
`npm run desktop:dev` · `npm run desktop:smoke` · `npm run icon` ·
`npm run schema:sqlite` · `npm run schema:ddl`

Pengujian offline & sinkronisasi:

`npm run test:sqlite` · `npm run test:offline` · `npm run test:sync` · `npm run review`

Aplikasi HP (lihat [MOBILE.md](MOBILE.md)):

`npm run mobile:check` · `npm run mobile:typecheck` · `npm run mobile:start`

`npm run verify` menjalankan typecheck + lint + review (61 pemeriksaan) + uji
konkurensi SQLite dalam satu perintah.

## API Utama

| Endpoint | Method | Catatan |
|---|---|---|
| `/api/auth/login` / `logout` / `me` / `change-password` | POST/POST/GET/POST | rate limit + lockout + audit; ganti password mencabut sesi lain |
| `/api/transactions` | GET, POST | POST = checkout atomic (idempotencyKey, hitung ulang server-side, stok bersyarat) |
| `/api/transactions/[id]` / `void` | GET, POST | void: hanya COMPLETED, alasan wajib, restock |
| `/api/catalog`, `/api/catalog/[id]` | GET/POST, PATCH | SKU/barcode unik per tenant; soft delete + mutasi ADJUSTMENT |
| `/api/categories`, `/api/customers` (+ `[id]`) | GET/POST, PATCH | phone ternormalisasi 62xxx |
| `/api/invoice-templates` (+ `[id]`) | GET/POST, PATCH/DELETE | config tervalidasi Zod (58mm/80mm/A4) |
| `/api/settings`, `/api/profile`, `/api/upload` | GET/PATCH, PATCH, POST | upload: sharp magic-bytes, resize 512, re-encode WebP (lossless utk PNG, q82 utk JPEG; fallback PNG bila lebih kecil), ≤300KB |
| `/api/whatsapp` | POST | deep-link wa.me + template token — BUKAN kirim otomatis |
| `/api/export`, `/api/reports`, `/api/dashboard` | GET | CSV/Excel/PDF (BOM UTF-8, ≤10.000 baris, tenant-scoped); agregat & tren |
| `/api/admin/dashboard|users|tenants|audit|settings` | GET/POST/PATCH | SUPER_ADMIN only; create user → password sementara tampil sekali |
| `/api/sync/mobile/ping` | GET | publik; cek server hidup, dibatasi 30/menit per IP |
| `/api/sync/mobile/bootstrap` | GET | perlu sesi; satu paket untuk HP: toko, kategori, produk, pelanggan, template, 200 nota terakhir |

## Model Keamanan (ringkas)

- **Auth**: scrypt + salt per user; session token 64-hex acak disimpan **sebagai sha256 hash**;
  cookie httpOnly `sameSite=lax`, TTL 7 hari + sliding refresh; user/toko nonaktif → sesi hangus.
- **Token untuk klien native**: `POST /api/auth/login` dengan header `x-client: native`
  mengembalikan `sessionToken` di body. Cookie `HttpOnly` tidak bisa dibaca React Native.
  Token ini **tidak pernah** sampai ke JavaScript browser.
- **Tenant isolation**: service-layer, `tenantId` selalu dari session. 1 user = 1 tenant.
- **Privilege**: SUPER_ADMIN & USER (Kasir). Public signup TIDAK ada — user dibuat admin.
- **Atomic & idempotent**: checkout satu `$transaction`; idempotencyKey → replay aman.
- **Brute force**: dua bucket rate limit — per-IP (10 login/menit) **dan** per-akun
  (30/menit, kunci di-hash) — plus lockout akun di DB (8 gagal → 15 menit). Yang per-akun
  ada supaya satu penyerang di WiFi bersama tidak mengunci semua kasir.
- **Anti price tampering**: harga selalu dihitung ulang dari database. Penjualan yang
  diantre dari HP offline mengirim `clientTotal`; kalau harga server sudah berubah,
  server menolak dengan `PRICE_CHANGED` alih-alih menyimpan angka yang tidak cocok
  dengan uang yang benar-benar diterima.
- **Headers**: CSP (`default-src 'self'`, `img-src data: blob:`), X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy; `assertSameOrigin` untuk mutasi.
- **Audit**: append-only, semua aksi signifikan, password tidak pernah dilog.

## Operasional Produksi

- **Backup**: `npm run db:backup` (pg_dump gzip + retensi + verifikasi integritas) —
  jalankan terjadwal via cron VPS/GitHub Actions; Supabase free TIDAK punya backup otomatis.
- **Pemantauan kuota**: `npm run db:size` — proyeksi menuju limit 500 MB.
- **Housekeeping**: `npm run db:prune` (pangkas audit > 90 hari + sesi expired; dry-run default,
  `--yes` untuk eksekusi).
- Aplikasi **stateless** (logo = data URL di DB, session = cookie + DB) → kompatibel serverless.

## Quality (ISO/IEC 25010 ringkas)

Fungsional inti terverifikasi via **QA manual browser end-to-end** (login, POS checkout,
void, laporan, export CSV/Excel/PDF, responsif 390–1280px, dark mode, multi-tenant isolation).
Lint & `tsc --noEmit` bersih.

## Disclaimer ISO

Serbabisa *designed with security controls aligned to relevant ISO/IEC 27001:2022 principles*
(prinsip kontrol, bukan sertifikasi). Mapping ISO/IEC 25010:2023 bersifat self-assessment.
Klaim verifikasi hanya sebatas QA manual browser di environment pengembangan.

## Known Limitations & Roadmap

- WhatsApp = deep-link manual; adapter `OfficialWhatsAppApiProvider` disiapkan, belum dibuat.
- Rate limit in-memory (per-instance); belum Redis. CSP masih memuat `unsafe-inline/eval` untuk dev.
- Isolasi tenant di application-layer (bukan RLS database) — RLS Postgres = hardening lanjutan.
- Roadmap: RLS Postgres, WA API resmi, refresh token rotation, backup otomatis terjadwal, MFA.

