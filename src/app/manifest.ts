import type { MetadataRoute } from "next";

/**
 * Web App Manifest — Serbabisa bisa "dipasang" ke layar utama tablet/ponsel
 * (Android: menu Chrome → "Tambahkan ke layar utama"; iPad/iPhone: Safari →
 * Bagikan → "Tambahkan ke Layar Utama"). Terpasang sebagai aplikasi mandiri
 * (display: standalone) — tanpa bilah URL, dengan warna tema merek.
 *
 * Service worker sengaja BELUM dipasang: mode dev (Turbopack) mengganti chunk
 * setiap edit — SW cache bisa "mengunci" chunk lama dan merusak preview.
 * Ditambahkan nalu di build produksi bila butuh offline penuh.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Serbabisa — Kasir POS",
    short_name: "Serbabisa",
    description:
      "Aplikasi kasir POS multi-tenant untuk produk & jasa: transaksi, nota, pelanggan, dan laporan.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "id",
    dir: "ltr",
    background_color: "#ffffff",
    theme_color: "#059669",
    categories: ["business", "finance", "shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
