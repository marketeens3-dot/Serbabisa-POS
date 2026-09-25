// Pengaturan global Super Admin — tanpa secret apa pun.
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, ScrollText, Settings2, ShieldCheck, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/shared";
import { useApi } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";

type AdminSettings = { appName: string; systemNotice: string | null }

export default function AdminSettingsView() {
  const { data, refresh } = useApi<AdminSettings>("/api/admin/settings")
  const [appName, setAppName] = useState("")
  const [systemNotice, setSystemNotice] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setAppName(data.appName ?? "Serbabisa")
      setSystemNotice(data.systemNotice ?? "")
    }
  }, [data])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (appName.trim().length < 2) {
      setError("Nama aplikasi minimal 2 karakter.")
      return
    }
    setSaving(true)
    try {
      await api.patch("/api/admin/settings", {
        appName: appName.trim(),
        systemNotice: systemNotice.trim() || null,
      })
      toast.success("Pengaturan global disimpan.")
      refresh()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Gagal menyimpan pengaturan.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Pengaturan Sistem"
        description="Konfigurasi global aplikasi — kredensial & secret dikelola via environment variable, bukan UI."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2.5">
            <span className="size-8 rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 flex items-center justify-center shrink-0" aria-hidden="true">
              <Settings2 className="size-4" />
            </span>
            Umum
          </CardTitle>
          <CardDescription>Nama aplikasi ditampilkan di seluruh antarmuka.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            {error && (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="as-app">Nama aplikasi</Label>
              <Input id="as-app" value={appName} onChange={(e) => setAppName(e.target.value)} maxLength={60} />
              <p className="text-xs text-muted-foreground">Maks 60 karakter — dipakai di header, judul halaman, dan nota cetak.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="as-notice">Notifikasi sistem (opsional)</Label>
              <Textarea
                id="as-notice"
                value={systemNotice}
                onChange={(e) => setSystemNotice(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="cth: Jadwal maintenance minggu ini…"
              />
              <p className="text-xs text-muted-foreground">Maks 300 karakter — ditampilkan ke seluruh tenant aktif.</p>
            </div>
            <Button type="submit" disabled={saving} className="active:scale-[0.98]">
              <Save className="size-4" />
              {saving ? "Menyimpan…" : "Simpan pengaturan"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2.5">
            <span className="size-8 rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/15 flex items-center justify-center shrink-0" aria-hidden="true">
              <ShieldCheck className="size-4" />
            </span>
            Keamanan &amp; Kredensial
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <div className="space-y-4">
            <div className="flex gap-3">
              <span className="size-7 rounded-lg bg-muted text-muted-foreground ring-1 ring-inset ring-border flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
                <KeyRound className="size-3.5" />
              </span>
              <p className="min-w-0">
                Kredensial (secret, API key, koneksi database) dikelola lewat environment variable server —
                tidak pernah dimasukkan lewat UI ini dan tidak dikirim ke browser.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="size-7 rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/15 flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
                <Lock className="size-3.5" />
              </span>
              <p className="min-w-0">
                Password selalu di-hash (scrypt), sesi disimpan sebagai token hash dengan cookie httpOnly,
                dan setiap aksi penting tercatat di audit log.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="size-7 rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
                <ScrollText className="size-3.5" />
              </span>
              <p className="min-w-0">
                Audit log bersifat append-only — jejak aktivitas tidak dapat diubah atau dihapus oleh siapa pun,
                termasuk Super Admin.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
