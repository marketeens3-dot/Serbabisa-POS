# Pemetaan Kualitas â€” ISO/IEC 25010:2023

Self-assessment jujur terhadap 9 karakteristik ISO/IEC 25010:2023, dengan bukti
verifikasi yang bisa direproduksi ulang.

## Metode verifikasi

Semua perintah berikut dijalankan terhadap **server sungguhan** (bukan mock) dengan
database Supabase sungguhan, lalu diulang pada build produksi:

| Perintah | Yang dibuktikan | Hasil |
|---|---|---|
| `npm run typecheck` | TypeScript strict, tanpa error | 0 error |
| `npm run lint` | ESLint (termasuk aturan React Compiler) | 0 error |
| `npm run schema:sqlite:check` | Skema SQLite tidak melenceng dari skema kanonik | OK |
| `npm run review` | Regresi API: auth, isolasi tenant, CSRF, uang, race, refund, shift, upload, nota, validasi, laporan, export, header keamanan, invarian data | **66/66 lulus** |
| `npm run test:sqlite` | 60 pembaca + 20 penulis bersamaan ke SQLite (WAL + busy_timeout) | 0 error |
| `npm run test:offline` | 14 pemeriksaan tanpa `DATABASE_URL` sama sekali | **14/14 lulus** |
| `npm run test:sync` | 21 pemeriksaan dua perangkat kasir ke cloud | **21/21 lulus** |
| `npm run desktop:smoke` | 4 pemeriksaan: server lokal, render, bridge preload, login API | 4/4 lulus |
| `npm run mobile:check` | Ketahanan aplikasi HP terhadap batasan Expo Go | OK |
| `npm run mobile:typecheck` | TypeScript aplikasi HP | 0 error |
| `npm run build` | Build produksi (28 route) | sukses |

Status memakai tiga label: *Verified via repeatable test*, *Design-reviewed*, dan
*NOT VERIFIED*. Tidak ada klaim yang dilebihkan.

## Pemetaan

| # | Karakteristik | Bukti implementasi | Status verifikasi |
|---|---|---|---|
| 1 | **Functional Suitability** | POS checkout atomic, idempotency, void + restock, refund parsial/total, sesi kasir + rekonsiliasi, opname stok, nota 58/80/A4, laporan, export CSV/XLSX/PDF, admin multi-tenant | Verified via repeatable test (66 cek API + 14 offline + 21 sync) |
| 2 | **Performance Efficiency** | Pagination (default 20/max 100, `pageSize` dibatasi server), indeks Prisma pada kolom filter tenant, agregat dibatasi, money `Int`, cache in-memory (top-sold 5 menit, stock-alerts 2 menit), code-splitting per view | `pageSize` dibatasi terverifikasi; **load test NOT VERIFIED** |
| 3 | **Compatibility** | Next.js standalone (Vercel + Electron), Prisma ganda (PostgreSQL & SQLite dari satu skema kanonik), Windows/Linux, CSV UTF-8+BOM, deep-link wa.me, Expo (dev & Go) | Verified via `test:offline` + `test:sync` + `desktop:smoke`; **interoperabilitas produksi NOT VERIFIED** |
| 4 | **Interaction Capability** | UI Bahasa Indonesia penuh (id-ID, Rp, 24 jam), pesan error yang self-describing, dialog konfirmasi void, baris keranjang dua tingkat, tips onboarding, shortcut kasir, target sentuh 40px, dark/light | Verified via browser QA sebelumnya; audit WCAG formal **NOT VERIFIED** |
| 5 | **Reliability** | Checkout `$transaction` (gagal = tidak setengah jadi), `idempotencyKey` anti double-submit, void = pembalikan bukan hapus, blok nota atomik, antrean offline tidak pernah menghapus entri gagal, runbook insiden | Verified: replay idempotensi, 5 checkout paralel tanpa stok minus, 14/14 offline, 21/21 sync |
| 6 | **Security** | scrypt + `timingSafeEqual`, session httpOnly, `tenantId` dari session, IDOR â†’ 404, rate limit + lockout, CSP + security headers, audit append-only, Electron `sandbox: true` + contextIsolation, secret sync internal + loopback | Verified via 66 cek (termasuk IDOR, CSRF, SQLi, header); **pentest pihak ketiga NOT VERIFIED**; **RLS PostgreSQL belum aktif** |
| 7 | **Maintainability** | TypeScript strict, lint bersih, dua skema dari satu sumber kanonik (dijaga `schema:sqlite:check`), konstanta domain terpusat, modul kriptografi dipisah dari-coupled Next, dokumentasi `docs/` ikut ter-version control | Verified (tooling bersih + drift check) |
| 8 | **Flexibility** | Zod schema mudah diubah, adapter WhatsApp, dua mode database dari satu service layer, MODE env (`SERBABISA_DB`), tiga platform (web/desktop/HP) dari satu API | Design-reviewed; **kasus migrasi nyata belum ada** |
| 9 | **Safety** | Stok tidak pernah minus, total dihitung ulang server-side, void/refund tanpa efek ganda, device-scoped invoice sebagai jaring pengaman, stok diturunkan dari ledger (bukan angka yang disalin) | Verified: stok insufficient ditolak, race 5 paralel, `test:sync` membuktikan stok konsisten di dua perangkat |

## Temuan yang diperbaiki lewat siklus ini

Dokumen ini bukan sekadar klaim. Siklus verifikasi menemukan dan memperbaiki cacat
nyata, antara lain:

1. `pg_database_size()` mengembalikan `bigint`; `BigInt / Number` melempar `TypeError`
   yang tertelan `catch`, lalu `db:size` **melaporkan ukuran SQLite lokal padahal
   database-nya PostgreSQL** â€”laporan kuota produksi bisa menyesatkan.
2. `review.mjs` mengirim `PATCH` tanpa assertion ke produk demo (mengubah namanya jadi
   "x") dan mereferensikan variabel yang di-deklarasikan setelahnya (`ReferenceError`).
3. Tidak ada satu pun perintah yang menjalankan `prisma generate` untuk Prisma Client
   SQLite, sehingga build `.exe` hanya berhasil di mesin yang kebetulan sudah
   meng-generate-nya secara manual.
4. Skrip operasional (`seed`, `bootstrap-admin`) hanya bisa jalan di Bun karena alias
   `@/`; sekarang berjalan di Node murni.
5. `docs/` ter-gitignore, sehingga repository tidak memuat satu pun dokumen keamanan.

## Catatan kejujuran

- **Belum ada uji beban, fault-injection infrastruktur, audit aksesibilitas WCAG,
  pentest pihak ketiga, maupun sertifikasi apa pun.**
- Klaim ISO di dokumen ini adalah *designed with security controls aligned to relevant
  ISO/IEC 27001:2022 principles* dan pemetaan 25010 sebagai **self-assessment** â€”
  **bukan pernyataan sertifikasi**.
- Batasan yang diketahui: PostgreSQL RLS belum aktif, SQLite tidak terenkripsi,
  rate limit in-memory per-instance, sinkronisasi polling (bukan real-time), installer
  belum ditandatangani. Semuanya dicatat di `docs/security/local-first-sync.md`.

## Rekomendasi lanjutan

1. Aktifkan **RLS di PostgreSQL** dan gunakan role database terbatas â€” ini hardening
   terbesar yang masih terbuka.
2. Uji beban sederhana pada `/api/transactions` sebelum go-live berbayar.
3. Audit WCAG dan pentest eksternal sebelum produksi multi-tenant berbayar.
4. Ganti `verify` manual dengan CI (GitHub Actions) yang menjalankan 8 perintah di atas.
