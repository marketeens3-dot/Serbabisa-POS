import type { NextConfig } from "next";

// Security headers — prinsip ISO/IEC 27001:2022 (information security).
// CSP longgar cukup untuk dev (Turbopack butuh unsafe-eval/inline); perketat di production.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self' https:",
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
  serverExternalPackages: ["@serbabisa/prisma-local"],
  // Buang paket yang tidak pernah dipakai saat runtime.
  //
  // Tanpa ini, output tracing ikut menyalin `typescript` (sekitar 19 MB) ke
  // dalam paket standalone karena Next memakainya saat typecheck build.
  // TypeScript hanya dibutuhkan saat build, bukan saat aplikasi berjalan,
  // jadi ikutnya di installer itu bobot yang tidak perlu diunduh kasir.
  outputFileTracingExcludes: {
    "*": ["node_modules/typescript/**", "node_modules/@types/**"],
  },
  // Sembunyikan indikator dev floating (pojok kiri bawah) agar preview di
  // ponsel/tablet bersih — overlay tersebut bukan bagian dari aplikasi.
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
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
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
