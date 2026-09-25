// Wajib ganti password (login pertama / reset akses oleh Super Admin).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiClientError } from "@/lib/api-client";
import type { SessionUserDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ChangePasswordScreen({ user }: { user: SessionUserDTO }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak sama.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      toast.success("Password berhasil diganti. Selamat bekerja!");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  // Indikator syarat password (presentasional — dibaca dari state yang ada).
  const requirements = [
    { label: "Minimal 8 karakter", ok: newPassword.length >= 8 },
    { label: "Mengandung huruf", ok: /[a-zA-Z]/.test(newPassword) },
    { label: "Mengandung angka", ok: /[0-9]/.test(newPassword) },
  ];

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo-icon.png" alt="Logo Serbabisa" className="h-10 w-auto" />
          <div>
            <p className="font-semibold text-lg tracking-tight">
              Serba<span className="text-primary">bisa</span>
            </p>
            <p className="text-xs text-muted-foreground">POS Kasir untuk Produk &amp; Jasa</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/80 shadow-lg shadow-primary/5 p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">Ganti password Anda</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Halo, {user.fullName}. Demi keamanan, Anda wajib mengganti password sebelum melanjutkan.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="current">Password saat ini (sementara)</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">Password baru</Label>
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="h-11"
              />
              <ul className="space-y-1.5 pt-1" aria-label="Syarat password baru">
                {requirements.map((r) => (
                  <li key={r.label} className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "size-4 rounded-full flex items-center justify-center shrink-0 transition-colors",
                        r.ok ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      )}
                      aria-hidden="true"
                    >
                      {r.ok ? <Check className="size-3" /> : <X className="size-3" />}
                    </span>
                    <span className={r.ok ? "text-foreground" : "text-muted-foreground"}>{r.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Ulangi password baru</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-11"
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-destructive">Konfirmasi belum sama dengan password baru.</p>
              )}
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold active:scale-[0.99]" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {loading ? "Menyimpan…" : "Simpan password baru"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">© 2026 Serbabisa</p>
      </div>
    </div>
  );
}
