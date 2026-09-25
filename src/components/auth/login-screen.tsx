// Layar login — email + password. Tanpa registrasi publik (akun hanya dibuat Super Admin).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChartColumn, Eye, EyeOff, Loader2, ReceiptText, ShieldCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiClientError } from "@/lib/api-client";

const BRAND_FEATURES = [
  { icon: Store, title: "Multi-toko terisolasi", desc: "Data tiap toko terpisah dan tidak bisa saling diakses" },
  { icon: ReceiptText, title: "Nota & WhatsApp otomatis", desc: "Thermal 58/80mm dan A4, kirim nota via wa.me" },
  { icon: ChartColumn, title: "Laporan real-time", desc: "Penjualan, stok menipis, dan item terlaris" },
  { icon: ShieldCheck, title: "Data aman & teraudit", desc: "Audit log tanpa jejak password, sesi httpOnly" },
] as const;

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/auth/login", { email: email.trim(), password });
      toast.success("Berhasil masuk. Selamat bekerja!");
      router.refresh(); // server component merender ulang dengan sesi baru
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Strip brand ringkas (mobile) */}
      <div className="lg:hidden flex items-center justify-center gap-2.5 py-4 px-6 bg-[#0c1a33] text-white border-b border-white/5">
        <img src="/logo-icon.png" alt="Logo Serbabisa" className="h-8 w-auto" />
        <p className="font-semibold text-base tracking-tight">
          Serba<span className="text-sky-400">bisa</span>
        </p>
        <span className="text-xs text-zinc-400">· POS Kasir untuk Produk &amp; Jasa</span>
      </div>

      {/* Panel brand (desktop) */}
      <div className="hidden lg:flex relative lg:w-[46%] flex-col justify-between p-12 bg-[#0c1a33] text-white overflow-hidden">
        {/* Dekorasi: grid titik + lingkaran blur */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 55% at 75% -10%, rgba(56,120,255,0.35), transparent), radial-gradient(ellipse 55% 45% at 8% 110%, rgba(34,211,238,0.16), transparent)",
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -top-28 -right-20 size-96 rounded-full bg-[#3878ff]/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          <img src="/logo-icon.png" alt="Logo Serbabisa" className="h-11 w-auto drop-shadow-lg" />
          <div>
            <p className="font-semibold text-lg tracking-tight">
              Serba<span className="text-sky-400">bisa</span>
            </p>
            <p className="text-xs text-zinc-400">POS Kasir untuk Produk &amp; Jasa</p>
          </div>
        </div>

        <div className="relative mt-10 lg:mt-0">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
            Satu aplikasi untuk
            <br />
            semua urusan kasir.
          </h1>
          <p className="mt-4 text-zinc-300 max-w-md leading-relaxed">
            Kelola produk, jasa, pelanggan, dan transaksi. Nota bisa dicetak atau dikirim via WhatsApp —
            semua data toko Anda terisolasi dan aman.
          </p>
          <ul className="mt-8 space-y-3.5">
            {BRAND_FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span
                  className="size-9 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <f.icon className="size-4.5 text-sky-300" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white">{f.title}</span>
                  <span className="block text-xs text-zinc-400 mt-0.5">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-zinc-500 mt-10 lg:mt-0">
          Desain keamanan mengacu prinsip ISO/IEC 27001:2022 · Mutu mengacu ISO/IEC 25010:2023
        </p>
      </div>

      {/* Form login — kartu kaca subtle di atas latar polos */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-6 sm:p-8 lg:p-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/80 shadow-lg shadow-primary/5 p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight">Masuk ke akun Anda</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Akun dibuat oleh Super Admin. Tidak ada pendaftaran publik.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
              {error && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="nama@toko.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11 text-base font-semibold active:scale-[0.99]" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {loading ? "Memproses…" : "Masuk"}
              </Button>
            </form>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-border/60 bg-muted/40 p-4">
            <p className="text-xs font-medium text-muted-foreground">Akun demo (lingkungan pengembangan)</p>
            <div className="mt-2 grid gap-1 text-sm tabular">
              <p>
                <span className="text-muted-foreground">Super Admin:</span> admin@serbabisa.local
                <span className="text-muted-foreground"> / </span> Serbabisa#2026
              </p>
              <p>
                <span className="text-muted-foreground">Kasir:</span> kasir@demo.local
                <span className="text-muted-foreground"> / </span> Kasir#2026
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © 2026 Serbabisa — POS Kasir untuk Produk &amp; Jasa
          </p>
        </div>
      </div>
    </div>
  );
}
