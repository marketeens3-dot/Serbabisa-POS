# Audit Logging — Serbabisa POS

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles
> (prinsip kontrol — bukan sertifikasi).

## Desain

- Tabel `AuditLog` **append-only**: aplikasi hanya melakukan `create` — tidak ada endpoint
  yang mengubah/menghapus entri audit (hanya penghapusan cascade saat resource fisik dihapus
  di level DB; baris log sendiri tidak di-edit).
- Satu helper `logAudit(tx, entry)` dipakai semua route; menerima transaction client agar
  log ikut commit atomik bersama aksi (checkout menulis log di dalam `$transaction` yang sama).
- Setiap entri: `actorUserId`, `tenantId`, `action`, `resourceType`, `resourceId`,
  `metadata` (JSON string), `ipAddress` (≤45 char), `userAgent` (≤250 char), `createdAt`.
- **Larangan keras**: metadata TIDAK BOLEH berisi password, token, session, ataupun secret
  lain (kontrak di kode dan di review checklist).
- Kualitas audit terverifikasi via sampling QA browser (entri muncul untuk login, transaksi,
  void, pembuatan user) — full audit-sweep testing formal **NOT VERIFIED IN CURRENT
  ENVIRONMENT**.

## Daftar Action (dari `src/lib/constants.ts`)

| Kelompok | Action |
|---|---|
| Auth | `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_LOCKED`, `LOGOUT`, `PASSWORD_CHANGED`, `MUST_CHANGE_PASSWORD_ENFORCED` |
| Manajemen user | `USER_CREATED`, `USER_UPDATED`, `USER_ACTIVATED`, `USER_DEACTIVATED`, `ACCESS_RESET`, `ROLE_CHANGE_ATTEMPT` |
| Tenant & toko | `TENANT_CREATED`, `TENANT_UPDATED`, `TENANT_ACTIVATED`, `TENANT_DEACTIVATED`, `STORE_SETTINGS_UPDATED`, `STORE_LOGO_UPDATED`, `PROFILE_UPDATED` |
| Katalog | `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_ACTIVATED`, `PRODUCT_DEACTIVATED`, `SERVICE_CREATED`, `SERVICE_UPDATED`, `SERVICE_ACTIVATED`, `SERVICE_DEACTIVATED` |
| Pelanggan | `CUSTOMER_CREATED`, `CUSTOMER_UPDATED`, `CUSTOMER_ACTIVATED`, `CUSTOMER_DEACTIVATED` |
| Transaksi | `TRANSACTION_CREATED` (metadata: invoice, total, metode bayar — bukan data sensitif), `TRANSACTION_VOIDED` (alasan void) |
| Nota & pesan | `INVOICE_TEMPLATE_CREATED`, `INVOICE_TEMPLATE_UPDATED`, `INVOICE_TEMPLATE_DELETED`, `INVOICE_DEFAULT_CHANGED`, `WHATSAPP_MESSAGE_GENERATED` |
| Lain-lain | `CSV_EXPORTED`, `ADMIN_SETTINGS_UPDATED` |

Contoh metadata yang **diperbolehkan**: nomor invoice, jumlah item, email user yang dibuat,
alasan void. Contoh yang **dilarang**: password (walau salah ketik), token sesi, hash password.

## Query Audit

Hanya `SUPER_ADMIN` (`GET /api/admin/audit`) — paginated + filter (aksi, tenant, aktor,
rentang waktu), lengkap dengan detail metadata per entri. Akses dari USER → 403 + entri
`ROLE_CHANGE_ATTEMPT` baru.

## Retensi & Penggunaan

- Audit dipakai untuk: investigasi insiden (`incident-response.md`), rekam jejak stok/void,
  dan bukti aktivitas ekspor data (`CSV_EXPORTED`).
- Belum ada retensi otomatis/pengarsipan — baris bertambah tanpa batas selama operasional
  (volume ritel kecil-menengah; arsipdingin bisa ditambahkan via backup berkala, lihat
  `backup-recovery.md`).
