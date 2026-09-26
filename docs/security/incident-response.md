# Incident Response Runbook — Serbabisa POS

> Designed with security controls aligned to relevant ISO/IEC 27001:2022 principles
> (prinsip kontrol — bukan sertifikasi). Runbook ringkas untuk operator.

## Prinsip Umum (diadaptasi dari blueprint)

1. **Jangan destructive retry.** Kegagalan yang tidak jelas penyebabnya tidak diulang dengan
   asumsi "mungkin berhasil kali ini" — ulangi hanya setelah penyebab diketahui.
2. **Catat request id / konteks** (waktu, user, endpoint, idempotencyKey, invoice number)
   sebelum menindaklanjuti.
3. **Verifikasi state transaksi sebelum retry** — jangan mengandalkan ingatan/kata kasir.

## Skenario 1 — Checkout Gagal / Timeout Jaringan

Gejala: kasir menekan bayar, tidak ada response (timeout / error jaringan).

1. Tenang: checkout **atomic** — jika gagal, tidak ada data setengah jadi (stok/counter/nota
   berubah bersama-sama atau tidak sama sekali).
2. Buka daftar Transaksi, cari `idempotencyKey` / nomor invoice terakhir milik kasir tsb.
   - **Ada** → transaksi SUKSES; error hanya pada tampilan response. Tidak perlu input ulang.
   - **Tidak ada** → transaksi benar-benar gagal; aman menekan bayar ulang (client memakai
     idempotencyKey sehingga replay double-click pun aman).
3. Bila sudah terlanjur dua nota untuk satu transaksi yang sama: void nota duplikat
   (alasan wajib, stok otomatis dikembalikan) — jangan mengedit DB secara manual.
4. Catat kejadian (waktu, user, invoice) untuk analisis penyebab.

## Skenario 2 — Dugaan Kebocoran Data Antar-Tenant (cross-tenant)

Gejala: user A mengklaim melihat data toko B.

1. Kumpulkan bukti: screenshot, nomor invoice/ID item yang terlihat, email pelapor, waktu.
2. Cek `AuditLog` (filter actor pelapor, rentang waktu): aksi `CSV_EXPORTED`,
   `TRANSACTION_VOIDED`, akses detail — apakah ada akses ke resource di luar tenant?
3. Uji reproduksi aman (akun pelapor): akses by-ID resource tenant lain → **harus 404**;
   panggilan API admin → **harus 403** (jika gagal = insiden nyata, tingkatkan).
4. Bila terbukti kebocoran: nonaktifkan akun terkait (sesi hangus seketika), snapshot
   `db/custom.db` untuk forensik, tandai audit entries terkait, lalu perbaiki akar masalah
   sebelum reaktivasi.
5. Laporkan dampak ke tenant terdampak secara jujur (data apa yang terlihat, berapa lama).

## Skenario 3 — Database Unavailable (SQLite)

Gejala: API 500 `INTERNAL_ERROR`, log `[api-error]` menunjukkan error Prisma/file lock.

1. **Jangan** menjalankan ulang `db:push`/reset saat penyebab belum diketahui (berisiko
   `--accept-data-loss`). Jangan menghapus `db/custom.db`.
2. Cek: apakah proses server ganda berjalan (SQLite satu writer)? Hentikan duplikat.
   Dev server di sandbox dijalankan double-fork — pastikan hanya satu instance hidup.
3. Cek disk penuh / permission folder `db/`.
4. Bila file rusak (corruption): pulihkan dari backup terbaru
   (`backup-recovery.md`), bandingkan dengan export CSV terakhir untuk mengukur kehilangan.
5. Komunikasi ke pengguna: "sistem sementara tidak tersedia" — jangan menyalahkan kasir,
   jangan minta mereka input ulang transaksi sebelum data diverifikasi.

## Skenario 4 — Kredensial Tercuri / Akun Disalahgunakan

1. Admin: nonaktifkan user (semua sesi hangus) atau jalankan reset akses.
2. Ganti password user (password sementara sekali-pakai, `mustChangePassword` aktif).
3. Review `LOGIN_SUCCESS`/`LOGIN_FAILED`/`LOGIN_LOCKED` untuk IP mencurigakan.
4. Bila Super Admin terdampak: jalankan ulang `bun run bootstrap-admin` dari env yang aman
   dan rotasi semua kredensial di `.env`.

## Kontak & Eskalasi

Operator internal → developer maintainer → (bila produksi) proses insiden organisasi.
Setiap insiden ditutup dengan entri kronologis dan pelajaran perbaikan (link ke roadmap).
