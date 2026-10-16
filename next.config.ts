import type { NextConfig } from "next";

// Security headers — prinsip ISO/IEC 27001:2022 (information security).
// Dev (Turbopack) butuh unsafe-eval/inline untuk HMR; production tanpa unsafe-eval.
const isProd = process.env.NODE_ENV === "production";
const csp = [
  "default-src 'self'",
  isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // Hanya halaman ini sendiri boleh meng-iframe (anti klikjacking).
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  // Prisma Client untuk runtime lokal (SQLite) dikecualikan dari bundling.
  //
  // PENTING: kalau client ini ikut di-inline oleh webpack, Prisma akan
  // meng-hardcode path absolut mesin build ke dalam bundle. Aplikasi .exe
  // lalu gagal start di komputer mana pun selain mesin build. Dengan
  // diecualikan, webpack hanya menulis require() dan output tracing
  // menyalin folder client + engine-nya ke dalam paket standalone.
  //
  // DI VERCEL kebalikannya: paket ini tidak pernah dimuat saat runtime
  // (lazy dynamic import di src/lib/db.ts hanya dieksekusi mode local).
  // Kalau tetap di-externalize, seluruh paket (±42 MB engine) ikut tersalin
  // ke serverless function → bundle bengkak & cold start lambat. Karena itu
  // pada build Vercel TIDAK di-externalize: kodenya di-bundle tapi mati
  // (dead code — tidak pernah dieksekusi di mode cloud).
  serverExternalPackages: process.env.VERCEL ? [] : ["@serbabisa/prisma-local"],
  // Buang paket yang tidak pernah dipakai saat runtime.
  //
  // Tanpa ini, output tracing ikut menyalin `typescript` (sekitar 19 MB) ke
  // dalam paket standalone karena Next memakainya saat typecheck build.
  // TypeScript hanya dibutuhkan saat build, bukan saat aplikasi berjalan,
  // jadi ikutnya di installer itu bobot yang tidak perlu diunduh kasir.
  //
  // DI VERCEL: Prisma Client SQLite (@serbabisa/prisma-local, ±42 MB) juga
  // dikecualikan — mode cloud tidak pernah memuatnya (lazy import di
  // src/lib/db.ts), jadi menyalinnya ke setiap serverless function hanya
  // memperbesar bundle & memperlambat cold start. Build desktop/self-host
  // TETAP memasukkannya karena butuh saat runtime (VERCEL env tidak diset).
  outputFileTracingExcludes: {
    "*": process.env.VERCEL
      ? [
          "node_modules/typescript/**",
          "node_modules/@types/**",
          "**/node_modules/typescript/**",
          // Dua bentuk pola: NFT bisa merekam paket sebagai folder utuh ATAU file-per-file.
          "**/node_modules/@serbabisa/prisma-local",
          "**/node_modules/@serbabisa/prisma-local/**",
        ]
      : ["node_modules/typescript/**", "node_modules/@types/**"],
  },
  // Sembunyikan indikator dev floating (pojok kiri bawah) agar preview di
  // ponsel/tablet bersih — overlay tersebut bukan bagian dari aplikasi.
  devIndicators: false,
  // Error tipe TIDAK diloloskan — jaga kualitas build produksi (tsc --noEmit
  // dijalankan juga di QA lokal, jadi build tidak akan mengejutkan).
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // HSTS — dipatuhi hanya bila diakses via HTTPS (Vercel); aman untuk http lokal.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
