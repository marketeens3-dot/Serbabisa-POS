# Serbabisa — SaaS POS Multi-Tenant

Aplikasi Point-of-Sale (POS) multi-tenant untuk UMKM Indonesia: kasir, katalog produk/jasa,
pelanggan, nota cetak & WhatsApp, laporan, dan admin multi-toko. UI Bahasa Indonesia
(locale `id-ID`, timezone `Asia/Jakarta`, format `Rp`, `DD/MM/YYYY`, 24 jam).

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles.
> Dokumen ini bukan pernyataan sertifikasi. Lihat bagian Disclaimer.

## Stack

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript 5 strict |
| UI | Tailwind CSS 4, shadcn/ui, lucide-react, sonner, next-themes (dark/light) |
| Data | Prisma 6 + **PostgreSQL (Supabase)**, Zod 4, react-hook-form |
| Deploy | **Vercel** (serverless) + Supabase (connection pooler) |

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
prisma/schema.prisma        Skema 13 model (PostgreSQL)
prisma/seed.ts              Data demo (idempotent)
scripts/bootstrap-super-admin.ts   Buat super admin dari env
scripts/backup-db.sh        Backup pg_dump produksi (gzip + retensi + verifikasi)
scripts/db-size-report.ts   Laporan ukuran & proyeksi kuota DB
scripts/prune-audit.ts      Housekeeping audit_logs & sesi expired (dry-run default)
src/lib/                    auth, api, audit, validation, rate-limit, whatsapp, invoice, format
src/app/api/                Route handlers (auth, admin, user, transaksi, export, dll.)
src/components/app/         AppShell SPA + hash router
src/components/user/        POS, produk, pelanggan, transaksi, nota, laporan, pengaturan
src/components/admin/       Users, tenants, audit, settings
```

## Setup Lokal (Supabase)

```bash
bun install
cp .env.example .env      # isi DATABASE_URL (lihat catatan koneksi di bawah)
bun run db:push           # sinkronkan skema ke PostgreSQL
bun run seed              # data demo (idempotent)
bun run dev               # http://localhost:3000
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
   DATABASE_URL="<session-pooler-url>" bun run db:push
   DATABASE_URL="<session-pooler-url>" SUPER_ADMIN_PASSWORD="<password-kuat>" bun run seed
   ```
5. **Segera ganti password** super admin & kasir demo setelah login pertama
   (Pengaturan → profil → ganti password).

Catatan: Hobby plan Vercel = ToS non-komersial — untuk bisnis, gunakan Pro.
Region function terdekat dengan DB (ap-southeast-1) disarankan (mis. `sin1`).

## Perintah

`bun run dev` · `bun run lint` · `bun run typecheck` · `bun run db:push` ·
`bun run seed` · `bun run bootstrap-admin` · `bun run db:backup` · `bun run db:prune` · `bun run db:size`

## API Utama

| Endpoint | Method | Catatan |
|---|---|---|
| `/api/auth/login` / `logout` / `me` / `change-password` | POST/POST/GET/POST | rate limit + lockout + audit; ganti password mencabut sesi lain |
| `/api/transactions` | GET, POST | POST = checkout atomic (idempotencyKey, hitung ulang server-side, stok bersyarat) |
| `/api/transactions/[id]` / `void` | GET, POST | void: hanya COMPLETED, alasan wajib, restock |
| `/api/catalog`, `/api/catalog/[id]` | GET/POST, PATCH | SKU/barcode unik per tenant; soft delete + mutasi ADJUSTMENT |
| `/api/categories`, `/api/customers` (+ `[id]`) | GET/POST, PATCH | phone ternormalisasi 62xxx |
| `/api/invoice-templates` (+ `[id]`) | GET/POST, PATCH/DELETE | config tervalidasi Zod (58mm/80mm/A4) |
| `/api/settings`, `/api/profile`, `/api/upload` | GET/PATCH, PATCH, POST | upload: sharp magic-bytes, resize 512, re-encode PNG, ≤300KB |
| `/api/whatsapp` | POST | deep-link wa.me + template token — BUKAN kirim otomatis |
| `/api/export`, `/api/reports`, `/api/dashboard` | GET | CSV/Excel/PDF (BOM UTF-8, ≤10.000 baris, tenant-scoped); agregat & tren |
| `/api/admin/dashboard|users|tenants|audit|settings` | GET/POST/PATCH | SUPER_ADMIN only; create user → password sementara tampil sekali |

## Model Keamanan (ringkas)

- **Auth**: scrypt + salt per user; session token 64-hex acak disimpan **sebagai sha256 hash**;
  cookie httpOnly `sameSite=lax`, TTL 7 hari + sliding refresh; user/toko nonaktif → sesi hangus.
- **Tenant isolation**: service-layer, `tenantId` selalu dari session. 1 user = 1 tenant.
- **Privilege**: SUPER_ADMIN & USER (Kasir). Public signup TIDAK ada — user dibuat admin.
- **Atomic & idempotent**: checkout satu `$transaction`; idempotencyKey → replay aman.
- **Brute force**: rate limit IP in-memory (10 login/menit) + lockout akun DB (8 gagal → 15 menit).
- **Headers**: CSP (`default-src 'self'`, `img-src data: blob:`), X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy; `assertSameOrigin` untuk mutasi.
- **Audit**: append-only, semua aksi signifikan, password tidak pernah dilog.

## Operasional Produksi

- **Backup**: `bun run db:backup` (pg_dump gzip + retensi + verifikasi integritas) —
  jalankan terjadwal via cron VPS/GitHub Actions; Supabase free TIDAK punya backup otomatis.
- **Pemantauan kuota**: `bun run db:size` — proyeksi menuju limit 500 MB.
- **Housekeeping**: `bun run db:prune` (pangkas audit > 90 hari + sesi expired; dry-run default,
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
