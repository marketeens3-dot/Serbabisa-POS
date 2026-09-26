# Backup & Recovery — Serbabisa POS (SQLite)

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles
> (prinsip kontrol — bukan sertifikasi).

## Target Backup

Seluruh data Serbabisa ada di **satu file SQLite**:

```
db/custom.db        (dituju DATABASE_URL=file:/home/z/my-project/db/custom.db)
```

Aplikasi stateless (logo = data URL di DB, sesi = cookie + tabel Session) → memulihkan file DB
sama dengan memulihkan seluruh layanan.

## Prosedur Backup (offline-safe)

SQLite mengunci writer saat transaksi; salin file **saat dev server berhenti** untuk hasil
konsisten tanpa tool tambahan:

```bash
# 1. Hentikan aplikasi (hentikan proses bun/next)
# 2. Salin file database
cp db/custom.db "backup/serbabisa-$(date +%Y%m%d-%H%M%S).db"
# 3. (Disarankan) salin juga definisi skema
cp prisma/schema.prisma "backup/schema-$(date +%Y%m%d).prisma"
# 4. Jalankan ulang aplikasi
```

Alternatif online (server hidup): gunakan `sqlite3 db/custom.db ".backup 'backup/file.db'"`
(API backup SQLite yang aman dari writer) — tool `sqlite3` belum tersedia di environment ini,
sehingga metode utama yang diverifikasi adalah salin saat server berhenti.

## Prosedur Restore

```bash
bun run dev   # pastikan server berhenti lebih dulu
cp backup/serbabisa-YYYYMMDD-HHMM.db db/custom.db
bun run db:push   # sinkronkan skema bila backup dari versi schema berbeda
bun run dev
```

Verifikasi pasca-restore: login admin → dashboard → jumlah transaksi & user sesuai ekspektasi;
lihat beberapa baris terakhir `AuditLog`.

## RTO / RPO Sederhana

| Metrik | Nilai (asumsi prosedur manual di atas) |
|---|---|
| RPO | = interval backup terakhir (tergantung jadwal operator; belum otomatis) |
| RTO | hitungan menit: deploy ulang + salin file DB + start server |

Kejujuran: **belum ada backup otomatis terjadwal** di environment ini (roadmap). Frekuensi
backup ditentukan operator sesuai volume transaksi (harian disarankan untuk ritel aktif).

## Jalur Upgrade ke Supabase / PostgreSQL

Aplikasi ini sengaja dibuat agar migrasi relatif lurus:

1. Ubah `datasource db.provider` di `prisma/schema.prisma` ke `postgresql` + `DATABASE_URL`.
   (Catatan: enum & field String-JSON dapat dipertahankan; migrasi ke tipe native bersifat opsional.)
2. `bun run db:push` ke database baru, lalu transfer data (skrip ETL / `pgloader` untuk SQLite→Postgres).
3. Tambahkan `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (server-side only) bila memakai layanan Supabase.
4. Opsional: tambahkan RLS Postgres sebagai lapisan isolasi kedua — service layer tetap dipertahankan.
5. Aplikasi tetap stateless → kompatibel Vercel/multi-instance setelah DB bukan file lokal.
