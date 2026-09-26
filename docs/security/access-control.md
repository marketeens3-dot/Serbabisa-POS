# Access Control — Serbabisa POS

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles
> (prinsip kontrol — bukan sertifikasi).

## Role

| Role | Cakupan | Dibuat oleh |
|---|---|---|
| `SUPER_ADMIN` | Semua tenant: dashboard agregat, users, tenants, audit, settings sistem | Bootstrap (`scripts/bootstrap-super-admin.ts`) |
| `USER` (Kasir) | Satu tenant: POS, katalog, pelanggan, transaksi, nota, laporan, pengaturan toko | Super Admin |

- **Tidak ada public signup** — akun hanya dibuat Super Admin (mencegah pembuatan tenant liar).
- Multi-tenant: **1 user = 1 tenant/toko** (relasi `User.tenantId`).

## Guard Route (server-side)

```
requireUser()         → 401 tanpa sesi · 403 bila bukan USER · 403 NO_TENANT tanpa tenant
                      · 403 MUST_CHANGE_PASSWORD bila wajib ganti password
requireSuperAdmin()   → 401 tanpa sesi · 403 + audit ROLE_CHANGE_ATTEMPT bila bukan admin
```

Guard berada di **setiap route handler** — frontend (hash router `#/app/*`, `#/admin/*` + guard
role di AppShell) hanya lapis UX, bukan kontrol keamanan. Client yang memanggil API tanpa hak
tetap ditolak server (diverifikasi: admin API dari USER → 403).

## Mekanisme Tenant Isolation (server-side)

1. Login → session (token di cookie httpOnly) → payload session memuat `tenant.id`.
2. `requireUser()` mengembalikan `{ user, tenantId }` — **tenantId dari session saja**.
3. Semua query Prisma memakai `WHERE tenantId` (list/detail/update/delete/export/aggregate).
4. ID item milik tenant lain → tidak cocok dengan filter → **404** (tidak membocorkan eksistensi).
5. Kasus khusus yang diverifikasi:
   - checkout: item divalidasi `id + tenantId + isActive` sebelum stok didecrement;
   - void: transaksi dicari `id + tenantId`;
   - export CSV & reports: selalu tenant-scoped.

## Proteksi Privilege Escalation

- Hanya `requireSuperAdmin()` yang dapat membuat/mengubah user & tenant; tidak ada endpoint
  yang mengizinkan user mengubah `role`/`tenantId` miliknya sendiri.
- Upaya user biasa memanggil API admin → 403 **dan** dicatat sebagai `ROLE_CHANGE_ATTEMPT`
  (actor diketahui dari session — audit mencatat siapa, kapan, dari IP mana).
- `mustChangePassword` mengunci akses fungsional hingga password diganti; password sementara
  dari admin hanya ditampilkan **sekali** dan tidak disimpan plaintext.
- Status user `INACTIVE/SUSPENDED` atau tenant nonaktif → sesi otomatis dianggap hangus
  (`getSessionUser` menolak).

## Password Policy

- Hash: `scrypt` (keylen 64) + salt acak 16-byte per user; verifikasi `timingSafeEqual`
  (anti timing attack).
- Kebijakan (divalidasi Zod): minimal 8 karakter, memuat huruf dan angka; maksimum 128.
- Ganti password (`/api/auth/change-password`) mencabut **semua sesi lain** milik user.
- Password **tidak pernah** muncul di log, audit, ataupun response API.

## Lockout & Session

| Mekanisme | Nilai |
|---|---|
| Rate limit login per IP | 10 percobaan/menit (in-memory, suplementer) |
| Lockout akun | 8 kegagalan → terkunci 15 menit (persisten di DB, `lockedUntil`) |
| Sesi | TTL 7 hari + sliding refresh (perpanjang bila sisa < 6 hari) |
| Token | 64-hex acak; DB menyimpan **sha256 hash** — pencurian DB ≠ session hijack |
| Cookie | `sb_session`, httpOnly, sameSite=lax, `secure` di production |

Audit: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_LOCKED`, `LOGOUT`, `PASSWORD_CHANGED`.
