# Secure Development — Serbabisa POS

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles
> (prinsip kontrol — bukan sertifikasi). Praktik yang dipakai repo ini + checklist review.

## Praktik yang Diterapkan

### Validasi Input — Zod 4 di semua endpoint

- Setiap route handler memvalidasi body/query/param dengan skema Zod (`src/lib/validation.ts`)
  sebelum menyentuh database; kegagalan → `INVALID_INPUT` 422 dengan pesan Indonesia.
- Nilai domain (role, status, payment method, movement type) dikunci sebagai konstanta
  (`src/lib/constants.ts`) — SQLite tidak punya enum Prisma, validasi dipindah ke aplikasi.
- Batas panjang field (`FIELD_LIMITS`), `MAX_TRANSACTION_ITEMS = 200`, `MAX_LOGO_BYTES`.
- Money = `Int`, quantity Float dibulatkan 3 desimal → tanpa kesalahan pembulatan rupiah.

### Output — escaping & error sanitasi

- Semua output dirender React (auto-escaping) — tidak ada `dangerouslySetInnerHTML`
  pada data user. Template WhatsApp memakai token `{{nama}}` yang di-replace literal
  (tanpa eval/template engine) lalu `encodeURIComponent` saat dibuat link.
- `handleApiError`: `ApiError`/`ZodError` dipetakan ke pesan Indonesia yang aman;
  Prisma `P2002` → "…sudah digunakan" (409), `P2025` → 404; error tak dikenal →
  `INTERNAL_ERROR` generik + log server-side. **Stack trace tidak pernah dikirim ke client.**

### Database — tanpa SQL string concat

- Akses data via Prisma Client (selalu parameterized). Raw SQL (mis. laporan stok menipis)
  memakai template tagged `$queryRaw` dengan parameter binding — **tidak ada** penyusunan
  string SQL dari input user.

### CSRF & headers

- Mutasi memanggil `assertSameOrigin(req)` — tiga lapis pertahanan:
  1. **`Sec-Fetch-Site`** (header Fetch Metadata, tidak dapat dipalsukan JavaScript):
     `cross-site` → ditolak; `same-origin`/`same-site`/`none` → diizinkan.
  2. **Origin/Referer vs Host atau `X-Forwarded-Host`** — cocok penuh (host+port) atau
     hostname bila reverse proxy melepas port dari Host (mis. Caddy `{host}`), sehingga
     permintaan sah dari browser di belakang gateway/proxy tidak salah ditolak (403).
  3. Cookie `SameSite=lax`.
- Pengujian: login & mutasi via localhost, IP jaringan, dan gateway `?XTransformPort=`
  lulus (200/201); serangan cross-site (`Origin: http://evil.com` /
  `Sec-Fetch-Site: cross-site`) tetap ditolak 403.
- `next.config.ts`: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation/payment
  disabled), CSP `default-src 'self'` + `img-src 'self' data: blob:` + `frame-ancestors`.

### Secrets

- Konfigurasi lewat `.env` (tidak di-commit; `.env.example` berisi contoh + peringatan).
- Tidak ada service-role key di environment SQLite ini; saat pindah ke Supabase, key
  service-role hanya untuk server (tidak pernah `NEXT_PUBLIC_`).

## Checklist Review (PR / perubahan keamanan)

- [ ] Endpoint baru memvalidasi **semua** input dengan Zod (termasuk query param & `id`).
- [ ] Endpoint memanggil `requireUser()` / `requireSuperAdmin()` — tidak ada "perkadangan asal jalan".
- [ ] Semua query data tenant menyertakan `WHERE tenantId` dari `AuthContext` — bukan dari
      body client. Data lintas tenant → 404, bukan 403/500.
- [ ] Mutasi memanggil `assertSameOrigin`; aksi signifikan menulis `logAudit` (tanpa secret).
- [ ] Error path tidak membocorkan stack/SQL/detail internal; pesan bahasa Indonesia.
- [ ] Tidak ada `dangerouslySetInnerHTML`, `eval`, atau string SQL concate.
- [ ] Input panjang dibatasi; angka uang tetap `Int`.
- [ ] Perubahan skema disertai `db:push` + penyesuaian seed/serializer.
- [ ] QA browser: lint (`bun run lint`) & `bun run typecheck` bersih.
