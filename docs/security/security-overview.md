# Security Overview — Serbabisa POS

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles
> (prinsip kontrol — **bukan** sertifikasi). Dokumen self-assessment.

## Ringkasan Model

Serbabisa adalah POS multi-tenant dengan tiga mode operasi: **web** (Vercel + Supabase),
**desktop Windows** (Electron, local-first), dan **aplikasi HP** (Expo, local-first).
Keamanan inti: **autentikasi server-side (scrypt + session cookie httpOnly)**,
**isolasi tenant di service layer**, **transaksi atomic + idempotent**, **audit log
append-only**, **validasi Zod semua input**, dan **security headers**.

Untuk mode local-first (SQLite di PC kasir, endpoint sync, aktivasi perangkat, alokasi
blok nota, antrean offline) ada dokumen tersendiri: **`local-first-sync.md`**.

## Isolasi Data: RLS vs Service Layer (JUJUR)

Rencana awal adalah RLS PostgreSQL. Yang benar-benar ada diimplementasi:

- `tenantId` **SELALU** diturunkan dari session server-side — tidak pernah dari body/query client.
- **Semua** query data tenant memakai `WHERE tenantId` (list, detail, update, delete, export).
- Akses lintas tenant (IDOR) mengembalikan **404** (data "tidak ada" bagi peminta), bukan 403
  yang membocorkan keberadaan data.
- **PostgreSQL RLS belum diaktifkan.** `DATABASE_URL` aplikasi memakai user database biasa.
  Kalau string koneksi bocor, pembarahan seluruh tabel toko menjadi mungkin. RLS adalah
  hardening yang direkomendasikan (tugas operasional, bukan kode aplikasi) dan STATUS-nya
  **belum terverifikasi**.
- Status verifikasi service layer: **verified via regression suite** (66 pemeriksaan,
  termasuk IDOR dengan UUID acak dan invarian "review tidak merusak data").

## Tabel Pemetaan Kontrol

| Kontrol | Rencana (Supabase) | Implementasi aktual | Status |
|---|---|---|---|
| Isolasi data tenant | RLS policy per `tenant_id` | Service layer: `WHERE tenantId` dari session di semua query; IDOR → 404 | Verified via regression suite |
| Row-Level Security | RLS policy | **Belum diaktifkan** — aplikasi bukan database role terbatas | NOT VERIFIED |
| Autentikasi | Supabase Auth | scrypt (`crypto`), salt acak/user, `timingSafeEqual`; session token random disimpan sebagai sha256 hash; cookie httpOnly sameSite=lax | Verified via regression suite |
| Manajemen kredensial | Supabase dashboard | Super Admin buat user + password sementara (tampil sekali), `mustChangePassword` dipaksa | Verified via browser QA |
| Admin privilege | service-role key server-side | `requireSuperAdmin()`; pelanggaran → 403 + audit `ROLE_CHANGE_ATTEMPT` | Verified via regression suite |
| Brute force | Supabase rate limit | Rate limit IP in-memory (10 login/menit) + lockout akun DB (8 gagal → 15 menit) | Verified via regression suite |
| Integritas transaksi | Postgres transaction | `db.$transaction` checkout atomic + `idempotencyKey` unique (replay aman) | Verified via regression suite |
| Audit | Supabase log | Tabel `AuditLog` append-only (lihat `audit-logging.md`) | Implemented; QA sampling |
| Input validation | — | Zod 4 pada semua route (body, query, param) | Verified via regression suite |
| XSS/CSRF | — | React escaping, CSP, SameSite=lax + `assertSameOrigin` untuk mutasi | Verified via regression suite |
| SQL injection | — | Prisma parameterized; raw SQL hanya dengan parameter binding | Verified via regression suite |
| Offline / sinkronisasi | — | SQLite lokal + sync LWW/append; blok nota atomik; ledger stok | Verified via `test:offline` (14) + `test:sync` (21) |

## Batas & Kejujuran

- **Belum ada RLS di PostgreSQL** (lihat di atas) — ini gap keamanan yang diketahui, bukan
  tersembunyi.
- **Tidak ada enkripsi at-rest** untuk SQLite lokal kasir maupun SQLite HP.
- **Perangkat yang hilang tidak bisa di-wipe dari jarak jauh**; aksenya manual.
- Rate limit in-memory bersifat per-instance (belum terdistribusi) — pada Vercel
  serverless ini berarti batasnya per-lambda, bukan global.
- Testing formal (Vitest/Playwright) belum dijalankan; yang ada adalah suite regresi
  berbasis HTTP yang dijalankan terhadap server sungguhan.
- CSP dev memuat `unsafe-inline`/`unsafe-eval` (kebutuhan bundler dev) — perketat saat
  produksi.
- Backup & restore: lihat `backup-recovery.md`.

## Dokumen Terkait

`local-first-sync.md` · `access-control.md` · `data-protection.md` · `backup-recovery.md` ·
`incident-response.md` · `secure-development.md` · `audit-logging.md`

