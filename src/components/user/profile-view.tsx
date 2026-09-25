// Profil: ubah nama & HP + ganti password. Role/tenant/status tidak dapat diubah user.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Save, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/shared";
import { useApp } from "@/components/app/app-context";
import { api, ApiClientError } from "@/lib/api-client";
import { formatPhoneDisplay } from "@/lib/phone";

export default function ProfileView() {
  const { user, refreshUser } = useApp()
  const [fullName, setFullName] = useState(user.fullName)
  const [phone, setPhone] = useState(user.phone ?? "")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileError(null)
    if (fullName.trim().length < 2) {
      setProfileError("Nama minimal 2 karakter.")
      return
    }
    setSavingProfile(true)
    try {
      await api.patch("/api/profile", { fullName: fullName.trim(), phone: phone.trim() || null })
      await refreshUser()
      toast.success("Profil disimpan.")
    } catch (err) {
      setProfileError(err instanceof ApiClientError ? err.message : "Gagal menyimpan profil.")
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi password baru tidak sama.")
      return
    }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError("Password baru minimal 8 karakter dan mengandung huruf serta angka.")
      return
    }
    setSavingPassword(true)
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("Password berhasil diganti. Sesi lain telah dikeluarkan.")
    } catch (err) {
      setPasswordError(err instanceof ApiClientError ? err.message : "Gagal mengganti password.")
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Profil Saya" description="Perbarui data diri dan keamanan akun Anda." />

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0" aria-hidden="true">
                <User className="size-4" />
              </span>
              Data Diri
            </CardTitle>
            <CardDescription>Email tidak dapat diubah karena terkait autentikasi.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              {profileError && <p className="text-sm text-destructive" role="alert">{profileError}</p>}
              <div className="space-y-2">
                <Label htmlFor="p-name">Nama lengkap</Label>
                <Input id="p-name" value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} maxLength={150} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="p-email">Email</Label>
                  <Input id="p-email" value={user.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-phone">Nomor HP</Label>
                  <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="08xxxxxxx" />
                  {phone && <p className="text-xs text-muted-foreground">Tampil: {formatPhoneDisplay(phone)}</p>}
                </div>
              </div>
              <Button type="submit" disabled={savingProfile}>
                <Save className="size-4" />
                {savingProfile ? "Menyimpan…" : "Simpan profil"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0" aria-hidden="true">
                <KeyRound className="size-4" />
              </span>
              Ganti Password
            </CardTitle>
            <CardDescription>Sesi di perangkat lain akan otomatis dikeluarkan.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePassword} className="space-y-4">
              {passwordError && <p className="text-sm text-destructive" role="alert">{passwordError}</p>}
              <div className="space-y-2">
                <Label htmlFor="p-cur">Password saat ini</Label>
                <Input id="p-cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="p-new">Password baru</Label>
                  <Input id="p-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                  <p className="text-xs text-muted-foreground">Minimal 8 karakter, huruf + angka.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-confirm">Ulangi password baru</Label>
                  <Input id="p-confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
              </div>
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? "Menyimpan…" : "Ganti password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-medium">Informasi keamanan akun</p>
              <ul className="mt-1.5 space-y-1 text-muted-foreground text-xs">
                <li>Role: <Badge variant="outline" className="ml-1">{user.role === "SUPER_ADMIN" ? "Super Admin" : "Kasir"}</Badge></li>
                <li>Toko: {user.tenant?.businessName ?? "—"}</li>
                <li>Role, status, dan toko hanya dapat diubah oleh Super Admin — tidak bisa diubah dari sini.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
