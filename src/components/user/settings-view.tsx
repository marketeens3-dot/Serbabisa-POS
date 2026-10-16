// Pengaturan toko: Informasi Toko (logo upload), Nota (template default), WhatsApp (template pesan), Preferensi.
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, MessageCircle, ReceiptText, Save, SlidersHorizontal, Smartphone, Store, Trash2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/shared";
import { useApp } from "@/components/app/app-context";
import { useApi } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { WHATSAPP_TEMPLATE_TOKENS, DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/whatsapp";
import { normalizeIndonesianPhone } from "@/lib/phone";
import { isPosSoundEnabled, playCartTick, setPosSoundEnabled } from "@/lib/pos-sound";
import type { InvoiceTemplateDTO, SessionUserDTO, TenantDTO, TenantInvoiceSettings } from "@/lib/types";
import { formatPhoneDisplay } from "@/lib/phone";

function SectionIcon({ icon: Icon, tone = "primary" }: { icon: React.ComponentType<{ className?: string }>; tone?: "primary" | "emerald" }) {
  return (
    <span
      className={
        tone === "emerald"
          ? "size-8 rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0"
          : "size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
      }
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  )
}

export default function SettingsView() {
  const { user, setUser, refreshUser } = useApp()
  const { data: templatesRes, refresh: refreshTemplates } = useApi<{ data: InvoiceTemplateDTO[] }>("/api/invoice-templates")
  const { data: settingsRes, refresh: refreshSettings } = useApi<{ settings: TenantInvoiceSettings }>("/api/settings")
  const templates = templatesRes?.data ?? []

  const [store, setStore] = useState({
    businessName: "",
    phone: "",
    whatsappNumber: "",
    address: "",
  })
  const [whatsappTemplate, setWhatsappTemplate] = useState("")
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<string>("CASH")
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>("")
  const [requireActiveShift, setRequireActiveShift] = useState(false)
  const [savingStore, setSavingStore] = useState(false)
  const [savingWa, setSavingWa] = useState(false)
  const [savingPref, setSavingPref] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Preferensi perangkat (bukan toko) — tersimpan di localStorage perangkat ini.
  const [soundOn, setSoundOn] = useState(true)
  useEffect(() => {
    setSoundOn(isPosSoundEnabled())
  }, [])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = user.tenant
    if (t) {
      setStore({
        businessName: t.businessName ?? "",
        phone: t.phone ?? "",
        whatsappNumber: t.whatsappNumber ?? "",
        address: t.address ?? "",
      })
    }
  }, [user.tenant])

  useEffect(() => {
    const s = settingsRes?.settings
    if (s) {
      setWhatsappTemplate(s.whatsappTemplate ?? DEFAULT_WHATSAPP_TEMPLATE)
      setDefaultPaymentMethod(s.defaultPaymentMethod ?? "CASH")
      setDefaultTemplateId(s.defaultTemplateId ?? "")
      setRequireActiveShift(s.requireActiveShift === true)
    }
  }, [settingsRes])

  useEffect(() => {
    if (!defaultTemplateId && templates.length) {
      const def = templates.find((t) => t.isDefault) ?? templates[0]
      setDefaultTemplateId(def.id)
    }
  }, [templates, defaultTemplateId])

  async function saveStore(e: React.FormEvent) {
    e.preventDefault()
    setSavingStore(true)
    try {
      const res = await api.patch<{ tenant: TenantDTO; settings: TenantInvoiceSettings }>("/api/settings", {
        businessName: store.businessName.trim() || undefined,
        phone: store.phone.trim() || null,
        whatsappNumber: store.whatsappNumber.trim() || null,
        address: store.address.trim() || null,
      })
      await refreshUser()
      toast.success("Informasi toko disimpan — otomatis dipakai di nota.")
      void res
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menyimpan informasi toko.")
    } finally {
      setSavingStore(false)
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "same-origin" })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message ?? "Gagal mengunggah logo.")
      }
      await refreshUser()
      toast.success("Logo toko diperbarui.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah logo.")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function removeLogo() {
    try {
      await api.patch("/api/settings", { logoUrl: null })
      await refreshUser()
      toast.success("Logo dihapus.")
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menghapus logo.")
    }
  }

  async function saveWhatsapp(e: React.FormEvent) {
    e.preventDefault()
    setSavingWa(true)
    try {
      await api.patch("/api/settings", { whatsappTemplate })
      refreshSettings()
      toast.success("Template pesan WhatsApp disimpan.")
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menyimpan template.")
    } finally {
      setSavingWa(false)
    }
  }

  async function savePreferences(e: React.FormEvent) {
    e.preventDefault()
    setSavingPref(true)
    try {
      await api.patch("/api/settings", { defaultPaymentMethod, defaultTemplateId, requireActiveShift })
      // Sinkron flag default di template
      await api.patch(`/api/invoice-templates/${defaultTemplateId}`, { action: "set_default" })
      refreshTemplates()
      refreshSettings()
      toast.success("Preferensi disimpan.")
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menyimpan preferensi.")
    } finally {
      setSavingPref(false)
    }
  }

  const waNumberInvalid = store.whatsappNumber.trim() !== "" && !normalizeIndonesianPhone(store.whatsappNumber)

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Pengaturan" description="Informasi toko, tampilan nota, pesan WhatsApp, dan preferensi kasir." />

      <Tabs defaultValue="store">
        <TabsList className="grid grid-cols-4 w-full mb-5">
          <TabsTrigger value="store">Toko</TabsTrigger>
          <TabsTrigger value="nota">Nota</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="pref">Preferensi</TabsTrigger>
        </TabsList>

        {/* ---------- INFORMASI TOKO ---------- */}
        <TabsContent value="store">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <SectionIcon icon={Store} />
                Informasi Toko
              </CardTitle>
              <CardDescription>Data ini otomatis tampil di header nota Anda.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveStore} className="space-y-4">
                {/* Logo */}
                <div className="flex items-center gap-4 rounded-xl border p-4">
                  <div className="size-20 rounded-xl border bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
                    {user.tenant?.logoUrl ? (
                       
                      <img src={user.tenant.logoUrl} alt={`Logo ${user.tenant.businessName}`} className="size-full object-contain" />
                    ) : (
                      <ImagePlus className="size-7 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>
                  <div className="space-y-2 min-w-0">
                    <p className="text-sm font-medium">Logo toko</p>
                    <p className="text-xs text-muted-foreground">PNG/JPG/WEBP hingga 10MB — otomatis dikecilkan &amp; dikompres ke WebP (hasil ≤ 300KB).</p>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                        {uploading ? "Mengunggah…" : "Unggah logo"}
                      </Button>
                      {user.tenant?.logoUrl && (
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={removeLogo}>
                          <Trash2 className="size-4" />
                          Hapus
                        </Button>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} aria-label="Pilih file logo" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="st-name">Nama toko</Label>
                  <Input id="st-name" value={store.businessName} onChange={(e) => setStore({ ...store, businessName: e.target.value })} required minLength={2} maxLength={150} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="st-phone">Nomor telepon</Label>
                    <Input id="st-phone" value={store.phone} onChange={(e) => setStore({ ...store, phone: e.target.value })} inputMode="tel" placeholder="08xxxxxxx" />
                    <p className="text-xs text-muted-foreground">{store.phone ? `Tampil: ${formatPhoneDisplay(normalizeIndonesianPhone(store.phone) ?? "")}` : "Opsional"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="st-wa">Nomor WhatsApp</Label>
                    <Input id="st-wa" value={store.whatsappNumber} onChange={(e) => setStore({ ...store, whatsappNumber: e.target.value })} inputMode="tel" placeholder="08xxxxxxx" aria-invalid={waNumberInvalid} />
                    {waNumberInvalid && <p className="text-xs text-destructive">Nomor WhatsApp tidak valid.</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-address">Alamat</Label>
                  <Input id="st-address" value={store.address} onChange={(e) => setStore({ ...store, address: e.target.value })} placeholder="Jl. …" maxLength={500} />
                </div>
                <Button type="submit" disabled={savingStore || waNumberInvalid}>
                  {savingStore ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Simpan informasi toko
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- NOTA ---------- */}
        <TabsContent value="nota">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <SectionIcon icon={ReceiptText} />
                Nota Default
              </CardTitle>
              <CardDescription>Template yang dipakai saat cetak nota di kasir &amp; detail transaksi.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!templates.length ? (
                <p className="text-sm text-muted-foreground">Belum ada template.</p>
              ) : (
                templates.map((t) => (
                  <label
                    key={t.id}
                    className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                      defaultTemplateId === t.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="default-template"
                      checked={defaultTemplateId === t.id}
                      onChange={() => setDefaultTemplateId(t.id)}
                      className="accent-primary"
                      aria-label={`Pilih template ${t.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.config.paperSize} · font {t.config.fontSize}px · {t.config.invoiceTitle}
                      </p>
                    </div>
                  </label>
                ))
              )}
              <p className="text-xs text-muted-foreground">
                Kustomisasi detail template (field, warna, footer) di halaman Nota.
              </p>
              <Button onClick={savePreferences} disabled={savingPref || !defaultTemplateId}>
                {savingPref ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Simpan nota default
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- WHATSAPP ---------- */}
        <TabsContent value="whatsapp">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <SectionIcon icon={MessageCircle} tone="emerald" />
                Template Pesan WhatsApp
              </CardTitle>
              <CardDescription>
                Pesan disiapkan dan dibuka via wa.me — token dalam kurung ganda otomatis diganti data transaksi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveWhatsapp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wa-tpl">Isi pesan</Label>
                  <Textarea
                    id="wa-tpl"
                    value={whatsappTemplate}
                    onChange={(e) => setWhatsappTemplate(e.target.value)}
                    rows={12}
                    maxLength={1500}
                    className="font-mono text-xs leading-relaxed"
                  />
                  <p className="text-xs text-muted-foreground">{whatsappTemplate.length}/1500 karakter</p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-3.5">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Token yang tersedia:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {WHATSAPP_TEMPLATE_TOKENS.map((token) => (
                      <code key={token} className="rounded bg-background border px-1.5 py-0.5 text-[11px] text-primary">
                        {`{{${token}}}`}
                      </code>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={savingWa}>
                    {savingWa ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Simpan template
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setWhatsappTemplate(DEFAULT_WHATSAPP_TEMPLATE)}>
                    Kembalikan bawaan
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- PREFERENSI ---------- */}
        <TabsContent value="pref">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <SectionIcon icon={SlidersHorizontal} />
                Preferensi
              </CardTitle>
              <CardDescription>Mata uang &amp; timezone mengikuti standar IDR / Asia/Jakarta.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={savePreferences} className="space-y-4">
                <div className="space-y-2">
                  <Label>Metode pembayaran default</Label>
                  <Select value={defaultPaymentMethod} onValueChange={setDefaultPaymentMethod}>
                    <SelectTrigger className="w-56" aria-label="Metode pembayaran default">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Tunai</SelectItem>
                      <SelectItem value="TRANSFER">Transfer</SelectItem>
                      <SelectItem value="QRIS">QRIS</SelectItem>
                      <SelectItem value="OTHER">Lainnya</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-lg border p-3.5 flex items-start gap-3">
                  <Switch
                    id="pref-require-shift"
                    checked={requireActiveShift}
                    onCheckedChange={setRequireActiveShift}
                    className="mt-0.5"
                    aria-describedby="pref-require-shift-desc"
                  />
                  <div className="min-w-0">
                    <Label htmlFor="pref-require-shift" className="text-sm font-medium cursor-pointer">
                      Wajib shift aktif untuk transaksi
                    </Label>
                    <p id="pref-require-shift-desc" className="text-xs text-muted-foreground mt-0.5">
                      Transaksi kasir ditolak bila tidak ada shift yang sedang berjalan — mencegah transaksi tanpa pertanggungjawaban kas.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-3.5">
                    <p className="text-sm font-medium">Mata uang</p>
                    <p className="text-sm text-muted-foreground mt-0.5">IDR — Rupiah</p>
                  </div>
                  <div className="rounded-lg border p-3.5">
                    <p className="text-sm font-medium">Zona waktu</p>
                    <p className="text-sm text-muted-foreground mt-0.5">Asia/Jakarta (WIB)</p>
                  </div>
                </div>
                <Button type="submit" disabled={savingPref}>
                  {savingPref ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Simpan preferensi
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Preferensi perangkat — per kasir per perangkat (localStorage), bukan toko. */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <SectionIcon icon={Smartphone} />
                Preferensi perangkat
              </CardTitle>
              <CardDescription>Berlaku untuk perangkat ini saja — tidak memengaruhi kasir lain.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border p-3.5 flex items-start gap-3">
                <Switch
                  id="pref-device-sound"
                  checked={soundOn}
                  onCheckedChange={(v) => {
                    setSoundOn(v)
                    setPosSoundEnabled(v)
                    if (v) playCartTick() // pratinjau bunyi saat diaktifkan
                  }}
                  className="mt-0.5"
                  aria-describedby="pref-device-sound-desc"
                />
                <div className="min-w-0">
                  <Label htmlFor="pref-device-sound" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Volume2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    Bunyi &amp; getar konfirmasi kasir
                  </Label>
                  <p id="pref-device-sound-desc" className="text-xs text-muted-foreground mt-0.5">
                    Bunyi singkat + getaran halus saat item masuk keranjang dan saat transaksi berhasil — membantu memastikan hasil scan barcode tanpa harus menatap layar. Getaran hanya tersedia di perangkat yang mendukung.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
