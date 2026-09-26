# Local-First & Sinkronisasi — Model Ancaman

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles
> (prinsip kontrol — **bukan** sertifikasi). Dokumen self-assessment.

Dokumen ini menutup permukaan serangan yang **tidak ada** di versi web saja: database
SQLite di komputer kasir, endpoint sinkronisasi internal, aktivasi perangkat, alokasi
blok nomor nota, dan antrean offline di aplikasi HP.

## 1. Kenapa perlu dokumen terpisah

Sebelum local-first, seluruh data ada di satu tempat (PostgreSQL) dan hanya satu yang
harus dijaga: API. Sekarang ada **tiga** locus data dengan sifat keamanan berbeda:

| Locus | Isi | Sifat | Siapa yang bisa mengakses |
|---|---|---|---|
| **SQLite lokal** (`%APPDATA%\serbabisa-pos\data\serbabisa.db`) | Salinan katalog, pelanggan, transaksi, **hash password** | Persisten, tidak terenkripsi, ada di disk kasir | Siapa pun yang memegang akses fisik atau logis ke PC kasir |
| **PostgreSQL (Supabase)** | Salinan bersama antar perangkat + sumber identitas | Terlindungi credential dan jaringan | Server aplikasi + admin database |
| **SQLite HP** (`expo-sqlite`) | Salinan lokal + antrean `outbox` | Persisten, tidak terenkripsi | Siapa pun yang memegang HP dalam keadaan terbuka |

Konsekuensi yang harus dinyatakan terang-terangan: **keamanan data di PC kasir dan di
HP berada pada level perangkat, bukan level aplikasi.** Aplikasi tidak menggantikan
enkripsi disk; itu tetap tanggung jawab pemilik toko.

## 2. Batas Kepercayaan

```
┌─ PC KASIR (host yang tidak fully trusted) ──┐        ┌─ CLOUD (trusted) ─┐
│  Electron renderer  (sandbox: true)         │        │                   │
│        │ 6 fungsi tervalidasi via preload    │        │  PostgreSQL       │
│        ▼                                     │        │                   │
│  Server lokal 127.0.0.1:3210 (loopback)     │◄──────►│  /api/sync/*      │
│        │                                     │  HTTPS │  /api/auth/*      │
│        ▼                                     │        │                   │
│  SQLite lokal ──► sync engine ───────────────┼────────►  blok nomor nota  │
└──────────────────────────────────────────────┘        └───────────────────┘
```

Batas yang ditegakkan:

1. **Hanya loopback.** Server lokal bind ke `127.0.0.1`, bukan `0.0.0.0`, jadi tidak
  appear di jaringan LAN. Modul admin tetap online-only karena butuh data lintas-toko.
2. **Renderer tanpa Node.** `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true`. Satu-satunya jembatan adalah `electron/preload.cjs` yang mengekspos
   6 fungsi dengan argumen tervalidasi. Navigasi keluar dialihkan ke browser default;
   permission (kamera, mikrofon, geolokasi) selalu ditolak.
3. **Endpoint sync internal.** `/api/sync/internal` dilindungi **dua lapis**: secret acak
   per instalasi (`%APPDATA%\serbabisa-pos\internal.secret`) **dan** pemeriksaan bahwa
   request berasal dari loopback. Secret tidak pernah dikirim ke renderer dalam bentuk
   mentah; dialog koneksi menampilkan password tersamar (`****`).
4. **Kredensial cloud tidak tersimpan di SQLite.** Yang ikut tersalin hanya
   `passwordHash` (scrypt) milik tenant tersebut — cukup untuk login offline, dan tidak
   berguna di luar PC itu. `DATABASE_URL` cloud hanya ada di `default-config.json`
   (nilai bawaan yang bisa diganti user) dan di environment proses.

## 3. Aktivasi Perangkat

Aktivasi pertama butuh internet **satu kali** (masalah ayam-telur: login offline butuh
user + `passwordHash` yang berasal dari cloud).

- Login pertama diverifikasi terhadap cloud. Kalau gagal, kasir mendapat pesan
  `OFFLINE_ACTIVATION_NEEDED` yang jelas, bukan error generik.
- Setelah itu seluruh login **murni lokal**; perangkat tidak pernah bicara ke cloud
  untuk autentikasi.
- Perangkat terdaftar di tabel `Device` dengan `@@unique([tenantId, name])`, sehingga
  satu toko tidak bisa meniru-namai perangkat milik toko lain. Reinstal di PC yang sama
  mendapat nama baru (akhiran id 4 karakter) supaya batasan unik tidak menolaknya.

**Risiko yang jujur:** aktivasi adalah satu-satunya momen perangkat terdaftar di cloud.
Setelah itu perangkat tidak bisa dicabut aksesnya secara remote. Ini adalah harga dari
kemampuan offline, dan diterima secara sadar, bukan tanpa disadari. Mencabut akses
perangkat yang hilang adalah tugas manual Super Admin, bukan kontrol otomatis.

## 4. Nomor Nota: Alokasi Blok

Dua PC yang sama-sama offline bisa sama-sama menerbitkan `INV-2026-000005`. Solusinya
blok nomor:

1. Perangkat memesan blok (50 nomor) dari cloud saat online.
2. Cloud menaikkan `InvoiceCounter` **atomik** dan mencatat bloknya di `InvoiceBlock`.
3. Perangkat memakai blok itu sendiri saat offline.

Karena tiap blok berasal dari satu increment atomik, nomor dijamin unik. Kalau blok
habis **dan** sedang offline, nomor menjadi *device-scoped* (`INV-2026-000005-KASIRPC`) —
dijamin unik, hanya muncul pada kondisi itu, dan kasir tidak pernah berhenti berjualan
hanya karena internet putus.

- `SystemSetting` berawalan `invoice.` **tidak pernah** ikut sync. Kalau bocor,
  perangkat lain akan memakai blok nota milik perangkat pertama.
- Bukti: `npm run test:sync` (21 pemeriksaan) — dua perangkat, blok A `1..50` dan B
  `51..100`, lima nota tanpa duplikat.

## 5. Stok: Turunan dari Ledger

Menyalin `stockQty` antar perangkat akan menimpa penjualan perangkat lain. Karena itu
stok **dihitung ulang** dari `InventoryMovement` (append-only), sehingga semua
perangkat berakhir pada angka yang sama apa pun urutan sinkronisasi.

- Hanya item yang **punya** `ADJUSTMENT` (titik awal) yang dihitung ulang. Item tanpa
  anchor tidak disentuh, karena titik awal stoknya tidak diketahui.
- Item hasil seed atau import perlu `npm run db:backfill-stock -- --yes`. Tanpa itu
  stoknya terlihat habis atau negatif setelah sinkronisasi pertama. Ini risiko
  operasional yang nyata, dan skripnya disediakan karena itu.

## 6. Antrean Offline (HP)

Penjualan saat server tidak terjangkau tidak hilang: ditulis ke `outbox`, dicatat sebagai
`cache_transaction` dengan `invoiceNumber = "MENUNGGU SINKRONISASI"` dan
`status = "QUEUED"`.

- Kegagalan **tidak pernah menghapus antrean**. Entri ditandai `failed` beserta
  alasannya dan ditampilkan di **Pengaturan → Perlu tindakan**. Ini penting: penjualan
  offline yang gagal naik berarti uang sudah diterima pelanggan tapi belum tercatat.
- Antrean dibatasi 500 entri. Kalau terlampaui, entri tertua dibuang dan jumlahnya
  dilaporkan ke kasir. Membuang yang lama lebih baik daripada membekukan aplikasi.
- Urutan **push dulu, baru pull**. Sebaliknya, salinan lama bisa menimpa perubahan
  lokal yang belum sempat naik.
- Stok yang ditampilkan = `stokServer - penjualanYangMasihAntre`, jadi penjualan
  offline langsung terlihat sebagai berkurangnya stok.

## 7. Pemetaan Kontrol (ISO/IEC 27001:2022, Annex A)

| Kontrol | Rujukan | Implementasi | Status |
|---|---|---|---|
| Segmentasi jaringan | A.8.22 | Server lokal loopback-only; modul admin online-only | Verified via `test:offline` |
| Pemisahan hak akses | A.5.15 | SUPER_ADMIN vs USER; guard server-side; renderer tanpa privilege OS | Verified via regression suite |
| Isolasi data tenant | A.8.10 / A.8.11 | `tenantId` dari session; IDOR ditangani 404; `Device` unik per tenant | Verified via regression suite (66 cek) |
| Autentikasi | A.5.17 | scrypt + `timingSafeEqual`; hash ikut ke SQLite untuk login offline | Verified via regression suite |
| Integritas data transaksi | A.8.26 | Checkout `$transaction`; `idempotencyKey`; void = pembalikan, bukan hapus | Verified via regression suite |
| Kelangsungan informasi (audit) | A.8.15 | `AuditLog` append-only; `InventoryMovement` append-only | Implemented; QA sampling |
| Proteksi kredensial | A.5.17 | Password tak pernah masuk log/audit; `DATABASE_URL` tak sampai ke renderer; dialog menyamar | Design-reviewed |
| Cadangan & pemulihan | A.8.13 | Backup = salin `serbabisa.db`; 3 langkah restore (lihat `backup-recovery.md`) | Design-reviewed |
| Manajemen insiden | A.5.24 | Runbook 4 skenario (lihat `incident-response.md`) | Design-reviewed |
| Privasi data | A.8.10 | Minimisasi data pelanggan; tanpa enkripsi at-rest SQLite (dinyatakan terbuka) | Disclosed as limitation |

## 8. Batas dan Kejujuran

- **Tidak ada enkripsi at-rest** untuk SQLite lokal maupun SQLite HP. Yang tersedia:
  minimalisasi data, `passwordHash` (bukan password polos), dan penguncian PC kasir
  (BitLocker). Untuk HP: kunci layar + SecureStore untuk token.
- **Perangkat hilang berarti data hilang.** Tidak ada remote wipe. Pemilik toko harus
  menjalankan `db:prune` dan rotasi password user bila PC hilang.
- **Installer belum ditandatangani** sehingga Windows SmartScreen menampilkan peringatan
  di PC kasir baru.
- **Sinkronisasi bersifat polling (5 menit), bukan real-time.**
- **Modul Super Admin online-only** (dashboard lintas-toko, kelola user dan tenant, audit
  global) — konsekuensi langsung dari local-first.
- Belum ada audit formal atau pentest pihak ketiga; status tetap *self-assessment*.

## 9. Checklist Sebelum Go-Live

1. Ganti password akun demo dan super admin (`admin@serbabisa.local`, `kasir@demo.local`).
2. Rotasi token GitHub yang pernah dibagikan; pastikan `.env` tidak masuk repo.
3. Pakai **session pooler (5432)** untuk satu proses Electron; **transaction pooler
   (6543) + `pgbouncer`** untuk Vercel.
4. Jalankan `npm run db:backup` terjadwal (Supabase free tidak punya backup otomatis).
5. Pantau kuota dengan `npm run db:size` (batas plan free sekitar 500 MB).
6. Aktifkan BitLocker pada PC kasir dan kunci layar HP.
7. Jalankan `npm run db:backfill-stock` bila ada produk hasil import atau seed.

## Dokumen Terkait

`security-overview.md` · `access-control.md` · `data-protection.md` ·
`backup-recovery.md` · `incident-response.md` · `secure-development.md` · `audit-logging.md`
