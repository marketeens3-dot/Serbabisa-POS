# Data Protection — Serbabisa POS

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles
> (prinsip kontrol — bukan sertifikasi).

## Minimisasi Data Pelanggan

Model `Customer` hanya menyimpan data yang benar-benar dipakai untuk POS/nota:
`name`, `phone` (ternormalisasi format 62xxx), `email`, `address`, `notes`, `isActive`.
Tidak ada NIK, tanggal lahir, atau data sensitif lain. Field semua dibatasi panjangnya
(`FIELD_LIMITS`, mis. notes ≤ 2000 karakter) agar payload tidak arbitrarily besar.

## Password

- Disimpan sebagai `scrypt:<salt>:<hash>` — **tidak pernah plaintext** (lihat `access-control.md`).
- Tidak pernah dikirim kembali ke client, tidak muncul di response API, log server, ataupun
  audit log (`logAudit` metadata dilarang memuat kredensial).
- Password sementara hasil `generateTemporaryPassword()` (alfabet tanpa karakter ambigu,
  13 karakter) hanya ditampilkan sekali di layar admin — tidak disimpan.

## Kredensial & Secret di Log

- Audit `metadata` hanya boleh berisi data bisnis (mis. jumlah item, email user baru,
  invoice number) — kontrak kode menolak password/token/secret.
- Error handler server (`handleApiError`) me-log `err.message` ke `console.error` dengan tag
  `[api-error]` dan mengembalikan pesan generik ke client — stack trace tidak bocor.

## Upload Aman (Logo Toko)

Risiko upload: polyglot file, decompression bomb, SVG dengan script, file data-URL raksasa.
Mitigasi di `/api/upload`:

1. Batas ukuran **≤ 300 KB** (dihitung sebelum diproses).
2. Whitelist tipe: **PNG/JPG/WEBP** saja.
3. Validasi isi file via **sharp** (deteksi format asli/magic bytes) — ekstensi & header
   deklarasi user tidak dipercaya.
4. **Resize ke 512px + re-encode sebagai PNG** → file output selalu PNG yang dihasilkan ulang
   (metadata/script/SVG tidak selamat proses re-encode).
5. Hasil disimpan sebagai **data URL** di kolom `Tenant.logoUrl` → tanpa penulisan file ke
   disk; aplikasi tetap stateless (laman CSP membatasi `img-src 'self' data: blob:`).

## Retensi & Privasi (praktik saat ini)

- Data tenant & transaksi **tidak dihapus otomatis** — void = status `VOID` (jejak utuh,
  konsisten dengan kebutuhan audit ritel).
- Soft-delete (isActive) untuk katalog/pelanggan — data historis transaksi tetap utuh.
- Hak hapus data tenant: saat ini dilakukan admin langsung di database (belum ada UI
  data-erasure per tenant; lihat roadmap README).
- Pencabutan akses user: deactivate → seluruh sesinya hangus seketika.

## Catatan Kejujuran

- PII pelanggan tidak dienkripsi at-rest (SQLite file) — mitigasi utama adalah minimisasi data
  dan pembatasan akses file; enkripsi at-rest direkomendasikan saat pindah ke Postgres/hosting.
- Ekspor CSV (transaksi/produk/pelanggan) tenant-scoped ≤ 10.000 baris, dicatat di audit
  (`CSV_EXPORTED`) agar penyalinan data terlacak.
