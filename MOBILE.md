# Serbabisa POS - Aplikasi HP (Expo / React Native)

Aplikasi kasir untuk Android dan iOS/iPadOS. **Local-first**: kasir tetap bisa
berjualan tanpa internet, dan semua yang tertunda otomatis dikirim ke server
begitu ada koneksi.

Dokumen ini menjelaskan cara menjalankan, cara kerjanya, batasannya, dan
bagaimana memverifikasinya.

---

## 0. Baca ini sebelum mulai

**Expo Go tidak bisa dipakai untuk aplikasi kasir offline, dan tidak pernah
menghasilkan APK/IPA.** Itu bukan pilihan â€” itu fakta teknis:

| | Expo Go | APK / IPA hasil build |
|---|---|---|
| Bisa start tanpa internet | **Tidak** | **Ya** |
| Alasan | Bundel JS diambil dari dev server (Metro) di komputer pengembang setiap kali aplikasi dibuka | Bundel JS tertanam di dalam berkas APK/IPA |
| Bisa dibagikan ke kasir | Tidak (tidak ada berkas) | **Ya** |
| Peran yang tepat | development & uji coba cepat | **pemakaian harian** |

Kalau Metro tidak terjangkau, Expo Go **tidak mau start sama sekali** â€” bukan
"jalan tapi offline". Karena itu aplikasi ini harus dipasang sebagai APK (Android)
atau IPA (iOS). Seluruh persiapan di repo ini sudah untuk itu; hanya ada satu
langkah yang tidak bisa dilakukan mesin ini: login akun Expo.

Ringkasnya:

- **Android** â€” bisa dibangun dari Windows lewat EAS cloud build, tanpa Mac.
  Perintah persis ada di bagian 3.
- **iOS / iPad** â€” kode dan konfigurasinya sudah siap (`supportsTablet: true`),
  tetapi build wajib lewat macOS + Xcode, atau EAS macOS runner (paket berbayar).
  Tidak bisa dari Windows.

---

## 1. Batasan yang harus Anda tahu duluan

### Expo Go bukan cara distribusi produksi

Expo Go adalah *sandbox*. Petunjuk resmi Expo:

> *"Expo Go cannot use third-party libraries that require custom native code.
> It's limited and not useful for building production-grade projects. We
> strongly recommend using development builds for any real project."*

Artinya kode di sini **berjalan di Expo Go** untuk pengembangan dan uji coba,
tapi untuk mendistribusikannya ke kasir di luar tim Anda harus pakai
`eas build` (development build) atau build store. Kode dan konfigurasinya
sama; yang berbeda hanya cara build-nya.

Selain itu, per Mei 2026 Expo Go di Play Store sudah tidak lagi mendapat
pembaruan berkala, jadi versi SDK bisa macet. Ini alasan tambahan untuk pindah
ke development build sebelum dipakai produksi.

### Yang tidak bisa dilakukan di Expo Go

Semua modul native yang dipakai aplikasi ini sudah bagian dari Expo SDK, dan
ada pemeriksaan otomatis (`mobile/scripts/check-expo-go.mjs`) yang menolak
dependensi baru di luar daftar itu. Jadi aplikasi tidak akan "berhasil
terpasang tapi crash saat dibuka" karena modul hilang.

Konsekuensinya: tidak ada library UI berat (NativeWind, tamagui), library
ikon vektor (`react-native-vector-icons` tidak ada di Expo Go), ataupun
pemindai barcode native. Ikon tab dibuat dari glyph teks, dan pemindai
barcode bekerja dengan mengetik atau mengirim barcode lalu Enter.

---

## 2. Menjalankan

### Untuk dipakai kasir (offline) â€” yang benar

```bash
cd mobile
npm install
npm run android     # build native + install ke emulator/HP yang tersambung (butuh Android SDK)
```

Perintah ini menghasilkan aplikasi sungguhan dengan bundel JS tertanam, jadi ia
**tetap jalan tanpa Metro dan tanpa internet**. Untuk HP yang tersambung lewat USB,
build debug terpasang otomatis.

### Untuk development cepat (butuhExpo Go + Metro)

```bash
npm run start                # hanya log & QR
npm run android:expo-go      # buka di Expo Go (Android)
npm run ios:expo-go          # buka di Expo Go (iOS, hanya macOS)
```

Jalur ini **tidak bisa dipakai offline** (lihat bagian 0) â€”Gunakannya hanya
untuk iterasi cepat.

Sebelum menjalankan, server harus hidup. Dari folder project utama:

```bash
npm run dev            # http://localhost:3000
```

Lalu di aplikasi: **Masuk**, lalu tekan "Server tidak bisa diakses? Atur di
sini", lalu masukkan alamat server.

| Perangkat            | Alamat                                       |
|----------------------|----------------------------------------------|
| Android emulator     | `http://10.0.2.2:3000` (otomatis)            |
| iOS simulator        | `http://localhost:3000` (otomatis)            |
| HP asli (WiFi sama)  | `http://<IP-LAN-KOMPUTER>:3000`               |
| Produksi             | `https://pos.tokoanda.com`                    |

Untuk HP asli, komputer harus berada di jaringan yang sama dan firewall harus
mengizinkan port 3000. Untuk uji coba dari mana saja, `npx expo start
--tunnel` memberi URL HTTPS tanpa perlu mengatur firewall.

Akun demo: `kasir@demo.local` / `Kasir#2026`

> **`react-dom` dikunci ke `19.2.3`.** Jangan dilepas. `expo` menarik `react-dom`
> sebagai peer opsional; tanpa pin, npm memilih versi terbaru (19.3.0) yang
> mensyaratkan `react@^19.3.0`, sementara Expo SDK 57 mengunci `react` di 19.2.3.
> Akibatnya `npm install` di folder `mobile/` **gagal** dengan ERESOLVE. Pin ini
> yang membuatnya bisa di-install ulang.

---

## 2b. Membuat APK (Android) â€” langkah yang bisa dilakukan

Tidak butuh Mac. EAS membangunnya di cloud.

```bash
cd mobile
npm install

npx eas-cli login          # sekali saja â€” accounts.expo.dev, akun gratis
npx eas-cli build --platform android --profile preview
```

Hasilnya: tautan unduh **APK** (profile `preview` memakai `distribution: internal`
+ `buildType: apk`, jadi kasir cukup meng-install berkasnya, tanpa Play Store).
Build-butuh sekitar 10-20 menit di cloud.

Kalau `eas build` minta `projectId`, itu normal â€” projectserta dibuat saat itu
juga, dan `projectId` akan masuk ke `app.json`. Setelah itu build berikutnya
tidak Ask lagi.

### iOS / iPad

```bash
# hanya di macOS dengan Xcode terpasang
npx eas-cli build --platform ios --profile preview   # simulator (cek cepat)
npx eas-cli build --platform ios --profile production # arsip untuk App Store/TestFlight
```

Dari Windows: tidak bisa. Alternatifnya EAS macOS runner (runner milik mereka,
paket berbayar) atau menyewa Mac sementara. Yang perlu disiapkan sebelum itu:
`bundleIdentifier` sudah diisi (`local.serbabisa.pos`) â€” **ganti dengan
reverse-DNS milik Anda** (`com.tokoanda.pos`) sebelum rilis, karena Apple
menolak identifier generik.

### distributing ke kasir

1. Unduh APK-nya, salin ke HP kasir.
2. Settings â†’ Apps â†’ Special app access â†’ **Install unknown apps** â†’ izinkan
   aplikasi Files/Chrome yang dipakai untuk membuka APK.
3. Buka APK â†’ Install.
4. Di aplikasi: masuk â†’ atur alamat server (Vercel atau IP on-premise).

Peringatan SmartScreen/Play Protect akan muncul karena APK belum ditandatangani.
Untuk produksi, tambahkan keystore dan `credentialsSource` di `eas.json`.

---

## 3. Cara kerjanya

### Alur data

```
   Layar (React Native)
        |  selalu baca dari
        v
   SQLite lokal  <->  sync engine  <->  Server (PostgreSQL)
   (expo-sqlite)       (outbox)          /api/sync/mobile/bootstrap
```

Semua layar membaca dari SQLite, bukan dari server. Inilah yang membuat
aplikasi tetap responsif dan tetap berfungsi tanpa internet.

### Tabel lokal

| Tabel                     | Isi                                    |
|---------------------------|----------------------------------------|
| `cache_tenant`            | profil toko                            |
| `cache_category`          | kategori                               |
| `cache_product`           | produk, jasa, harga, stok              |
| `cache_customer`          | pelanggan                              |
| `cache_transaction`       | nota (lokal dan dari server)           |
| `cache_invoice_template`  | template nota                          |
| `outbox`                  | perubahan lokal yang belum naik        |
| `meta`                    | server URL, token sesi, keranjang      |

### Antrean offline (outbox)

Penjualan saat server tidak terjangkau tidak hilang. Aplikasi menulisnya ke
`outbox` dan mencatat nota sementara di `cache_transaction` dengan
`invoiceNumber = "MENUNGGU SINKRONISASI"` serta `status = "QUEUED"`, lalu
segera memberi tahu kasir bahwa penjualan sudah aman tersimpan di perangkat.

Saat sinkron berjalan, entri dikirim satu per satu, urutan lama dulu
(`createdAt` ASC). Server mengembalikan nota asli, lalu placeholder-nya diubah
menjadi nota asli. Jadi kasir tidak pernah melihat satu penjualan dua kali.

Kegagalan tidak pernah menghapus antrean. Entri ditandai `failed` lengkap
dengan alasannya, dan ditampilkan di **Pengaturan - Perlu tindakan**. Ini
penting: penjualan offline yang gagal naik berarti uang sudah diterima
pelanggan tapi belum tercatat, dan pemilik toko wajib melihatnya.

Antrean dibatasi 500 entri. Kalau terlampaui, entri tertua dibuang dan
jumlahnya dilaporkan ke kasir. Membuang yang lama lebih baik daripada
membekukan aplikasi.

### Urutan sinkron: push dulu, baru pull

Kalau pull lebih dulu, data basi dari server bisa menimpa pekerjaan kasir
yang belum sempat naik. Jadi urutannya push lalu pull.

### Stok yang ditampilkan

Ini bagian yang paling mudah salah, jadi dijelaskan terbuka:

```
stokDitampilkan = stokServer - penjualanYangMasihAntre
```

`stokServer` ditulis apa adanya dari server. Penjualan yang masih di outbox
(termasuk yang `failed`) dikurangkan secara manual saat ditampilkan.

Begitu penjualan berhasil di-push, server sudah mengetahuinya dan `stokServer`
ikut turun, jadi pengurangan ini hilang dengan sendirinya. Tidak ada
mekanisme "kembalikan" yang rawan lupa.

> Versi pertama memakai `MAX(stokServer, stokLokal)`. Akibatnya stok tidak
> pernah turun sama sekali, dan penjualan dari perangkat lain tidak akan
> pernah terlihat. Itu salah, dan sudah diganti.

### Nomor nota

Nomor nota diberikan server, saat penjualan berhasil naik. Selama masih
antre, nota menampilkan "MENUNGGU SINKRONISASI". Sengaja tidak dikira nomor
resmi, supaya tidak ada yang salah mengutip.

### Harga yang berubah saat offline

Kalau admin mengubah harga saat perangkat offline, angka yang dibayar
pelanggan tidak lagi cocok dengan harga server. Aplikasi mengirim
`clientTotal` bersama penjualan yang antre, dan server menolak dengan kode
`PRICE_CHANGED` plus pesan yang menjelaskan selisihnya.

Transaksi ini tidak boleh diam-diam disimpan dengan angka lain, karena uang
yang diterima kasir tidak akan cocok dengan catatan keuangan. Menolaknya
memaksa catatan manual, dan itu pilihan yang lebih jujur.

`clientTotal` tidak dikirim untuk penjualan online. Kalau cache harga di
perangkat basi, mengirimnya akan membuat server menolak checkout yang sah.

### Autentikasi

Cookie sesi `HttpOnly` tidak bisa dibaca React Native, dan cookie store
native tidak konsisten antara iOS dan Android. Karena itu:

1. Login dengan header `x-client: native` membuat server mengembalikan
   `sessionToken` di body.
2. Token itu dikirim balik sebagai header `Cookie` secara manual.

Token tidak pernah sampai ke JavaScript browser, karena header
`x-client: native` hanya diminta aplikasi native. Jalur web tidak berubah
sama sekali.

### Password wajib diganti

Server menandai akun baru dengan `mustChangePassword`. Selama flag itu belum
turun, aplikasi menahan kasir di layar ganti password dan tidak bisa masuk ke
POS. Sesi di-cabut setelah berhasil, jadi password lama benar-benar tidak
berlaku.

### Proteksi same-origin

Server menolak request cross-site dari browser (`Origin` atau
`Sec-Fetch-Site: cross-site`). Klien native tidak mengirim `Origin` sama
sekali, dan itu memang diizinkan. Justru itulah yang membuat aplikasi HP
bisa bekerja. Yang tetap berlaku: `tenantId` selalu dari session, tidak
pernah dari input perangkat.

---

## 4. Endpoint yang dipakai

| Endpoint                         | Akses     | Keterangan |
|----------------------------------|-----------|------------|
| `GET /api/sync/mobile/ping`      | publik    | cek server hidup, dibatasi 30/menit per IP |
| `GET /api/sync/mobile/bootstrap` | perlu sesi | satu paket: toko, kategori, produk, pelanggan, template, 200 nota terakhir |
| `POST /api/auth/login`           | publik    | dengan `x-client: native` mengembalikan `sessionToken` |
| `POST /api/auth/change-password` | perlu sesi | menghapus sesi setelah berhasil |
| `POST /api/transactions`         | perlu sesi | dengan `idempotencyKey` dan `clientTotal` |
| `POST /api/customers`            | perlu sesi | boleh diantre saat offline |

`bootstrap` sengaja satu permintaan, bukan belasan. HP sering berada di
jaringan seluler yang mahal dan lambat, dan kasir sedang menunggu.

---

## 5. Verifikasi

```bash
cd mobile

# 1. Kesehatan config & dependensi Expo (21 pemeriksaan)
npx expo-doctor

# 2. Semua modul native dipastikan tersedia di Expo Go
node scripts/check-expo-go.mjs

# 3. Tidak ada error TypeScript
npm run typecheck

# 4. Bundel benar-benar bisa dibangun untuk KEDUA platform
npx expo export --platform android --platform ios --output-dir dist-verify
```

Nomor 4 adalah pembuktian yang paling jujur: ia menangkap import yang hilang,
modul native di luar Expo Go, dan kesalahan bundling apa pun. Hal itu tidak
akan terlihat dari `tsc` saja. Hasil terakhir di mesin ini:

```
iOS Bundled      1156 modules  -> 2.6 MB
Android Bundled  1291 modules  -> 2.9 MB
expo-doctor      21/21 checks passed
```

Bisa juga memakai skrip dari folder project utama:

```bash
npm run mobile:doctor     # expo-doctor
npm run mobile:check      # allowlist Expo Go
npm run mobile:typecheck  # TypeScript
npm run mobile:export     # bundle android + ios
```

Di sisi server, dari folder project utama:

```bash
npm run review          # 66 pemeriksaan: uang, stok, tenant, keamanan, concurrency
npm run test:offline    # 14 pemeriksaan mode offline
npm run test:sync       # 21 pemeriksaan sinkronisasi dua perangkat
npm run test:sqlite     # konkurensi SQLite
```

> Yang **belum** terverifikasi: aplikasi belum pernah dijalankan di perangkat
> nyata maupun emulator, karena tidak ada perangkat di lingkungan build ini.
> Semua bukti di atas bersifat build-time. Satu-satunya pembuktian penuh adalah
> menjalankan APK di HP kasir.

---

## 6. Yang sengaja tidak ada, dan alasannya

| Tidak ada                    | Alasan |
|------------------------------|--------|
| Edit produk atau harga dari HP | Mengubah katalog saat ada antrean offline berisiko menimpa perubahan kasir lain. Yang bisa dibuat dari HP hanya pelanggan baru, karena tidak menyentuh stok atau harga. |
| Laporan dari HP              | Laporan butuh data lengkap seluruh periode. Dari HP yang sering offline, angkanya bisa tampak lengkap padahal belum. Kasir yang butuh laporan membuka versi web. Lebih jujur daripada menampilkan angka yang belum tentu benar. |
| Cetak struk dari HP          | Butuh bridge ke printer Bluetooth thermal yang tidak tersedia di Expo Go, dan konfigurasinya berbeda tiap perangkat. |
| Ganti server di Pengaturan    | Sengaja. Salah ketik server akan menghapus cache dan antrean. Alamat server diubah lewat Keluar, lalu Atur di sini di layar masuk, dengan peringatan eksplisit kalau masih ada antrean. |

---

## 7. Batasan yang diketahui

- **Sinkron bukan real-time.** Sync berjalan saat aplikasi dibuka, setelah
  checkout, saat masuk, dan saat tombol "Sinkron sekarang" ditekan. Untuk
  versi desktop ada penjadwal 5 menit; versi HP hanya berjalan saat aplikasi
  aktif. Kasir yang menutup aplikasi setelah menjual tidak akan mengunggah
  sampai dia membukanya lagi.
- **Belum ada riwayat versi.** Konflik diselesaikan dengan last-write-wins
  tanpa menyimpan siapa yang menang dan kapan.
- **Hanya 200 nota terakhir** tersimpan di cache. Untuk riwayat yang lebih
  lama, buka versi web.
- **Batas 2.000 item katalog** per toko dalam satu paket bootstrap. Toko
  dengan katalog lebih besar butuh paginasi, yang belum ada.
- **Tidak ada ARM64** yang dikonfigurasi.
- **iOS hanya bisa dibangun di macOS.** Kodenya sama, tapi build-nya butuh
  Xcode.

---

## 8. Langkah ke depan

1. Development build (`eas build`) supaya bisa didistribusikan ke kasir.
2. Layar laporan dengan penanda jelas "belum lengkap", alih-alih
   menyembunyikannya.
3. Paginasi bootstrap untuk katalog besar.
4. Sync di background (battery / background fetch) agar penjualan terkirim
   meski aplikasi ditutup.
