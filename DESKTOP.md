# Serbabisa POS — Windows Desktop (.exe)

Aplikasi web Serbabisa POS dibungkus menjadi **aplikasi native Windows** (.exe) memakai
[Electron](https://www.electronjs.org), dan redesigned agar **berjalan penuh tanpa internet**
(local-first) dengan sinkronisasi ke Supabase saat koneksi tersedia. Tidak ada fitur yang
dipotong: seluruh backend Next.js (route handlers, Prisma) dan seluruh UI tetap utuh.

## Mode LOCAL-FIRST (inti fitur ini)

Aplikasi desktop **tidak pernah bergantung pada Supabase untuk bekerja**. Semua baca/tulis
 POS terjadi pada **SQLite lokal**; Supabase adalah salinan bersama antar perangkat dan
sumber identitas. Web (Vercel) tetap memakai Supabase langsung seperti sebelumnya.

```
  Kasir (PC 1)                     Kasir (PC 2)                    Admin
 ┌──────────────┐                ┌──────────────┐              ┌────────────┐
 │ SQLite lokal │                │ SQLite lokal │              │  Vercel    │
 │ (source of   │                │ (source of   │              │ (cloud)    │
 │  truth saat  │                │  truth saat  │              │            │
 │  offline)    │                │  offline)    │              │            │
 └──────┬───────┘                └──────┬───────┘              └─────┬──────┘
        │  push (transaksi, stok,     │                              │
        │  pelanggan, katalog)        │                              │
        └──────────────┬───────────────┘                              │
                       ▼                                              ▼
                 PostgreSQL (Supabase)  ◄── pull (katalog, template, user) ──┘
```

### Mengapa ini mungkin: dua skema, satu model data

Prisma mengunci `provider` di waktu generate, jadi butuh dua Prisma Client:

| Client | Database | Dipakai oleh |
|---|---|---|
| `@prisma/client` | PostgreSQL | Sync engine saja |
| `@serbabisa/prisma-local` | SQLite | Seluruh runtime aplikasi |

Keduanya dijamin **identik**: `scripts/generate-sqlite-schema.mjs` membaca
`prisma/schema.prisma` lalu mengganti **hanya blok `datasource`**. Jadi service layer yang
sudah ada tidak berubah sama sekali untuk berjalan di salah satunya.

> Penting: client SQLite **wajib** berada di `node_modules` **dan** didaftarkan di
> `serverExternalPackages` (next.config.ts). Kalau di luar `node_modules`, Next meng-inline
> Prisma client ke dalam bundle dan meng-hardcode path absolut mesin build — `.exe` lalu
> gagal start di komputer lain. `scripts/build-desktop.mjs` memverifikasi ini dan gagal cepat
> bila ada path absolut yang bocor ke bundle.

### Aktivasi pertama (butuh internet **satu kali**)

Masalah ayam-telur: login offline butuh user + `passwordHash` di SQLite lokal, tapi user itu
berasal dari cloud. Solusinya tanpa konsep baru (tanpa kode aktivasi admin):

1. Login pertama diverifikasi terhadap **cloud**.
2. Kalau berhasil, tenant + user + kategori + katalog + pelanggan + template disalin ke
   SQLite lokal.
3. Semua login berikutnya **murni lokal** — offline pun bisa masuk.

`passwordHash` (scrypt) ikut tersalin, jadi tidak ada password polos di disk. Kalau cloud
tidak terjangkau saat aktivasi, kasir mendapat pesan yang jelas, bukan error generik.

### Nomor nota: alokasi blok per perangkat

Dua PC yang sama-sama offline bisa sama-sama menerbitkan `INV-2026-000005`. Solusinya:

1. Perangkat memesan **blok** nomor (50) dari cloud saat online.
2. Cloud menaikkan `InvoiceCounter` **atomik** dan mencatat bloknya di `InvoiceBlock`.
3. Perangkat memakai blok itu sendiri saat offline.

Karena tiap blok berasal dari satu increment atomik, nomor dijamin unik. **Format nota tidak
berubah** (`INV-YYYY-NNNNNN`), jadi nota yang sudah tercetak ke customer tetap sah.

Kalau blok habis **dan** sedang offline, nomor menjadi *device-scoped*
(`INV-2026-000005-KASIRPC`) — dijamin unik, hanya muncul pada kondisi itu, dan kasir tidak
pernah berhenti berjualan hanya karena internet putus.

### Stok: turunan dari ledger, bukan angka yang disalin

Menyalin `stockQty` antar perangkat akan menimpa penjualan perangkat lain. Karena itu stok
dihitung ulang dari `InventoryMovement` (append-only), sehingga semua perangkat berakhir pada
angka yang sama apa pun urutan sinkronisasi.

Dua aturan penting:

- **Titik awal** (`ADJUSTMENT`) dicatat saat produk dibuat. Item yang dibuat lewat seed/import
  perlu `npm run db:backfill-stock -- --yes` — tanpa itu, stoknya akan terlihat habis
  atau negatif setelah sinkronisasi pertama.
- Hanya item yang **punya** `ADJUSTMENT` yang dihitung ulang. Item tanpa anchor tidak boleh
  disentuh, karena titik awal stoknya tidak diketahui.

### Aturan sinkronisasi

| Entitas | Strategi | Catatan |
|---|---|---|
| Tenant, User, Category, CatalogItem, Customer, InvoiceTemplate, Transaction | **LWW** | bandingkan `updatedAt`; perubahan lokal menang kalau sama |
| TransactionItem, InventoryMovement, CashSession, AuditLog | **append** | hanya diterima cloud, tidak pernah ditimpa |
| Session | **tidak ikut sync** | milik perangkat |
| SyncState, Device, InvoiceBlock | **tidak ikut sync** | bookkeeping |

Urutan sinkronisasi: **push dulu, baru pull** (sebaliknya, salinan lama bisa menimpa
perubahan lokal yang belum sempat naik). Push selalu mendahului pull, dan `InventoryMovement`
child diproses setelah `Transaction` induknya Foreign key aman.

Kunci `SystemSetting` berawalan `sync.`, `device.`, atau `invoice.` **tidak pernah** ikut
sync — kalau bocor, perangkat lain akan memakai blok nota milik perangkat pertama.

Scheduler berjalan tiap 5 menit di main process Electron, lewat endpoint internal
`/api/sync/internal` yang dilindungi secret per-instalasi + pembatasan loopback.

## Cara kerja (Electron)

```
┌─────────────────────────────────────────────────────────┐
│ Serbabisa POS.exe  (Electron, ~135 MB compressed)        │
│                                                         │
│  main process ──► anak: Serbabisa POS.exe (ELECTRON_RUN_AS_NODE=1)
│      env: SERBABISA_DB=local                            │
│           LOCAL_DATABASE_URL=%APPDATA%\serbabisa-pos\data\serbabisa.db
│           DATABASE_URL=<Supabase, hanya untuk sync>     │
│      scheduler: trigger /api/sync/internal tiap 5 menit  │
│  BrowserWindow ────────► memuat UI dari 127.0.0.1:3210   │
└─────────────────────────────────────────────────────────┘
```

- **Server lokal** berjalan di `127.0.0.1` (loopback saja, tidak terlihat di jaringan).
  Port otomatis dipilih mulai dari 3210, atau dipatok lewat config.
- **Renderer** dimuat dari `http://127.0.0.1:<port>`, jadi `document.cookie` session
  (`sb_session`) behave persis seperti di browser — seluruh fitur auth tetap berlaku.
- **Keamanan renderer**: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`. Renderer tidak punya akses Node; satu-satunya jembatan adalah
  `electron/preload.cjs` yang mengekspos 6 fungsi tervalidasi.
- **Navigasi keluar** dialihkan ke browser default; permission (kamera/mik/geolokasi)
  selalu ditolak.

## Persiapan (sekali saja)

```bash
# 1. Dependency
npm install                # `bun install` juga berfungsi, hanya tidak dibutuhkan lagi

# 2. Pastikan .env berisi DATABASE_URL (nilai ini yang akan tertanam di .exe)
#    dan skema database sudah ada:
npm run db:push
npm run seed

# 3. Smoke test (opsional, sangat disarankan)
npm run desktop:smoke
```

> **Penting — build di Windows.** `node_modules` harus berisi binding native Windows:
> `lightningcss-win32-x64-msvc`, `@tailwindcss/oxide-win32-x64-msvc`, `@img/sharp-win32-x64`,
> `@img/sharp-libvips-win32-x64`, dan Prisma engine `query_engine-windows.dll.node`.
> Kalau `node_modules` hasil `install` di Linux/macOS, jalankan `npm install` ulang di Windows.
> `scripts/build-desktop.mjs` akan **gagal cepat** dengan pesan jelas bila binding ini hilang.

> **Penting — Prisma Client SQLite.** Desktop memakai *dua* Prisma Client, jadi
> `postinstall` (`prisma generate`, khusus PostgreSQL) saja tidak cukup. Client
> SQLite dibangun oleh `npm run schema:sqlite`, yang dipanggil otomatis oleh
> `desktop:prepare`. Kalau pernah menjalankan `next build` manual, jalankan
> `npm run schema:sqlite` lebih dulu — tanpa itu `next build` gagal me-resolve
> `@serbabisa/prisma-local`, dan gejalanya baru muncul saat build, bukan saat install.

> **Turbopack tidak dipakai.** `next build` dan `next dev` dipaksa memakai `--webpack`
> karena Turbopack gagal membuat junction point untuk `@prisma/client` di Windows.

## Build

```bash
# Build penuh: next build → rakit paket → .exe
npm run desktop:dist
```

Berkas keluar ada di `release/`:

| Berkas | Keterangan |
|---|---|
| `Serbabisa-POS-1.0.0-Setup.exe` | Installer NSIS (wizard: pilih folder, shortcut Desktop + Start Menu, uninstall) |
| `Serbabisa-POS-1.0.0-Portable.exe` | Satu file, jalan dari flashdisk tanpa install |
| `win-unpacked/` | Hasil build tanpa installer (untuk tes cepat / zip internal) |

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm run desktop:prepare` | `next build` + rakit `desktop-build/` saja (tanpa paket .exe) |
| `npm run desktop:pack` | `--dir` → hanya `win-unpacked/`, cepat, untuk verifikasi |
| `npm run desktop:dist` | Installer NSIS + portable |
| `npm run desktop:dev` | Jalankan shell Electron dari source (server dari `.next/standalone`) |
| `npm run desktop:smoke` | 4 pemeriksaan otomatis: server hidup, halaman render, bridge preload, login API |
| `npm run icon` | Bangun ulang `build/icon.ico` dari `public/icon-512.png` |
| `npm run schema:sqlite` | Regenerasi `prisma/schema.sqlite.prisma` dari skema kanonik |
| `npm run schema:sqlite:check` | Verifikasi tidak ada melenceng (dipakai CI) |
| `npm run schema:ddl` | Regenerasi DDL first-run untuk SQLite |

## Pengujian

Tiga skrip ini adalah pembuktian fitur offline — bukan sekadar unit test:

| Perintah | Yang dibuktikan |
|---|---|
| `npm run test:sqlite` | 60 pembaca + 20 penulis bersamaan ke SQLite. Membuktikan `journal_mode=WAL` + `busy_timeout` benar-benar aktif |
| `npm run test:offline` | **14 pemeriksaan.** Server dijalankan **tanpa `DATABASE_URL` sama sekali**: DB lokal dibuat dari DDL, aktivasi ditolak dengan pesan jelas, lalu (setelah identitas disuntik) login, katalog, checkout, dan nomor nota berhasil |
| `npm run test:sync` | **21 pemeriksaan.** Dua perangkat kasir untuk satu toko, keduanya berjualan, lalu sinkron: blok nota tidak bentrok, masing-masing melihat transaksi usur, stok konsisten, sync berulang tidak menggandakan data, dan **sesi perangkat tidak pernah masuk cloud** |

`test:sync` membuat tenant uji sendiri di cloud lalu **menghapus bersih** di akhir — data
demo tidak disentuh. Butuh `DATABASE_URL` yang aktif.

### Kalau stok item suddenly berubah sendiri setelah sinkronisasi

Penyebabnya hampir selalu ledger yang belum lengkap. Jalankan:

```bash
npm run db:backfill-stock          # dry-run: tampilkan rencana
npm run db:backfill-stock -- --yes # terapkan
```

Skrip ini menulis movement `ADJUSTMENT` sebesar stok awal untuk item yang belum punya
anchor, memakai rumus `stokSekarang − jumlahMovement` (bukan stok sekarang, yang akan
menghitung penjualan dua kali).

`desktop:dist` memakai `--skip-next-build` pada langkah rakit karena `next build` sudah
dijalankan di dalamnya. Kalau kamu hanya ingin paket ulang tanpa build ulang Next:

```bash
node scripts/build-desktop.mjs --skip-next-build
node node_modules/electron-builder/out/cli/cli.js --config electron-builder.yml
```

## Koneksi database

Urutan_resolution `DATABASE_URL` (lihat `electron/config.cjs`):

1. **File user** — `%APPDATA%\serbabisa-pos\config.json`
2. **Environment** — `DATABASE_URL` dari environment proses
3. **Nilai bawaan tertanam** — `resources/default-config.json` (diambil dari `.env`
   saat `npm run desktop:prepare`)

Jadi aplikasi **langsung jalan** setelah di-install, tapi string koneksi bisa diganti
tanpa rebuild:

- Menu **Aplikasi → Koneksi Database…**
- Dialog juga terbuka otomatis saat belum ada koneksi sama sekali
- Ada tombol **Kembalikan Bawaan** untuk kembali ke nilai tertanam
- Setelah disimpan, server lokal di-restart dan UI dimuat ulang otomatis

Password di string koneksi ditampilkan tersamar (`****`) di dialog dan tidak pernah
dikirim ke renderer dalam bentuk mentah.

> Untuk server lokal jangka panjang di dalam .exe gunakan **session pooler** port
> `5432`. Transaction pooler `6543` + `pgbouncer=true` khusus untuk serverless yang
> membuka banyak koneksi paralel; untuk satu proses Electron tidak diperlukan dan
> bisa menambah latensi.

## Isi paket

```
release/win-unpacked/
  Serbabisa POS.exe                 ← shell Electron
  resources/
    app.asar                        ← main.cjs, preload.cjs, ipc.cjs, config.cjs, connection.html
    default-config.json             ← DATABASE_URL Supabase (bawaan, bisa diganti)
    server/                         ← Next.js standalone
      server.js
      .next/{server,static}
      public/
      node_modules/                 ← Prisma engine + sharp win32
        @serbabisa/prisma-local/    ← Prisma Client SQLite + query_engine-windows.dll.node
        @prisma/client/            ← Prisma Client PostgreSQL (khusus sync)
```

`server/` sengaja ditaruh **di luar asar**: Prisma dan sharp memuat file `.dll.node`
lewat `dlopen`, yang tidak bisa dari dalam arsip.

## Data lokal

| Kebutuhan | Lokasi |
|---|---|
| Database SQLite | `%APPDATA%\serbabisa-pos\data\serbabisa.db` (+ `-wal`, `-shm`) |
| Log aplikasi | `%APPDATA%\serbabisa-pos\desktop.log` (rotasi 1 MB → `desktop.log.1`) |
| Config user | `%APPDATA%\serbabisa-pos\config.json` |
| Secret endpoint sync | `%APPDATA%\serbabisa-pos\internal.secret` |
| Buka cepat | Menu **Aplikasi → Buka Folder Data** / **Buka Log Diagnostik** |

**Backup** = salin `serbabisa.db`. Untuk backup yang konsisten, hentikan aplikasi dulu
(Atau salin trio `.db`, `.db-wal`, `.db-shm` bersamaan saat aplikasi ditutup).

Isi log: siklus hidup app, URL server, output server Next.js, hasil sinkronisasi
(`naik`/`turun`/`konflik`), dan error startup. Berguna saat kasir melapor "tidak bisa konek".

## Soal tanda tangan (code signing)

`.exe` saat ini **belum ditandatangani**. Windows SmartScreen akan menampilkan
"Windows telah melindungi PC Anda" saat pertama dijalankan — user klik
*More info → Run anyway*, atau klik "Run anyway" di dialog. Untuk produksi:

1. Beli kode signing certificate (OV/EV).
2. Simpan sebagai `.pfx`, lalu tambahkan ke `electron-builder.yml`:

```yaml
win:
  certificateFile: C:\secure\serbabisa.pfx
  certificatePassword: ${env.CSC_KEY_PASSWORD}
```

3. Build ulang — `electron-builder` menandatangani `Serbabisa POS.exe`, installer,
   dan portable sekaligus.

## Batasan & konsekuensi yang perlu diketahui

- **Windows x64 saja** (64-bit). ARM64 belum dikonfigurasi.
- Ukuran installer ± 135 MB karena berisi runtime Node + Next.js + Chromium + 2 Prisma engine.
- **Modul admin (SUPER_ADMIN) tetap online-only.** Dashboard lintas-toko, kelola user/tenant,
  dan audit global butuh data seluruh toko yang tidak ada di satu PC kasir. Kasir tetap
  bisa offline penuh.
- **Aktivasi pertama butuh internet sekali.** Sesudah itu, login offline tersedia selamanya.
- **`passwordHash` scrypt tersimpan di SQLite lokal.** Ini yang membuat login offline
  mungkin, dan hanya berisi user milik toko tersebut. Tetap PC kasir perlu dikunci (bitlocker)
  (bitlocker).
- **Sinkronisasi bersifat polling, bukan real-time**, bukan real-time. Default 5 menit.
- **Perangkat reinstall di PC yang sama** mendapat nama device baru (ada akhiran 4 karakter
  id) supaya batasan unik cloud tidak menolaknya.
- **Konflik dua perangkat mengedit item yang sama** diselesaikan last-write-wins berdasarkan
  `updatedAt`; perubahan lokal menang kalau waktunya sama. Tidak ada riwayat versi.
- Installer belum ditandatangani → SmartScreen warning di komputer kasir baru.
