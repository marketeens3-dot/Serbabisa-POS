import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Serbabisa — Kasir POS",
    template: "%s · Serbabisa",
  },
  description:
    "Serbabisa — aplikasi kasir POS SaaS multi-tenant untuk produk & jasa. Kelola transaksi, nota, dan pelanggan dengan aman.",
  icons: {
    icon: [
      // Logo asli (transparan, tanpa background) — favicon tab browser.
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo-icon.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  // viewportFit cover → env(safe-area-inset-*) aktif di PWA standalone iOS,
  // dipakai bottom nav (padding safe-area) agar tidak tertutup home indicator.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1013" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster richColors position="top-right" toastOptions={{ style: { borderRadius: "10px" } }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
