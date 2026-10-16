// Invoice Builder: pilih/duplikat template, ubah konfigurasi (Zod-validated, JSON typed — bukan raw HTML),
// live preview dengan data contoh, set default, simpan.
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Save, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/app/shared";
import { InvoiceRenderer, type InvoiceStore } from "@/components/invoice/invoice-renderer";
import { usePrintInvoice } from "@/components/invoice/print-invoice";
import { useApp } from "@/components/app/app-context";
import { useApi } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import type { InvoiceTemplateConfig, PaperSize } from "@/lib/invoice";
import type { InvoiceTemplateDTO, TransactionDTO } from "@/lib/types";

const SAMPLE_TX: TransactionDTO = {
  id: "sample",
  invoiceNumber: "INV-2026-000123",
  subtotal: 85000,
  discountAmount: 5000,
  discountPercent: 0,
  taxAmount: 0,
  totalAmount: 80000,
  paidAmount: 100000,
  changeAmount: 20000,
  paymentMethod: "CASH",
  status: "COMPLETED",
  notes: null,
  voidReason: null,
  voidedAt: null,
  refundedAmount: 0,
  refundReason: null,
  refundedAt: null,
  createdAt: new Date().toISOString(),
  cashierId: "x",
  cashierName: "Kasir Demo",
  customerId: null,
  customerName: "Budi Santoso",
  customerPhone: "628123456789",
  items: [
    // Contoh preview: satu item dengan diskon per item agar builder bisa
    // mempratinjau tampilan baris "Diskon" di nota.
    { id: "1", catalogItemId: "a", itemType: "PRODUCT", itemNameSnapshot: "Oli Mesin 1L", skuSnapshot: "OLI-1L", quantity: 1, unitPrice: 65000, subtotal: 58500, discountAmount: 6500, discountPercent: 10, refundedQty: 0 },
    { id: "2", catalogItemId: "b", itemType: "SERVICE", itemNameSnapshot: "Jasa Ganti Oli", skuSnapshot: null, quantity: 1, unitPrice: 20000, subtotal: 20000, discountAmount: 0, discountPercent: 0, refundedQty: 0 },
  ],
}

const TOGGLES: { key: keyof InvoiceTemplateConfig; label: string }[] = [
  { key: "showLogo", label: "Logo" },
  { key: "showAddress", label: "Alamat" },
  { key: "showPhone", label: "Telepon" },
  { key: "showCustomer", label: "Nama pelanggan" },
  { key: "showCustomerPhone", label: "No. pelanggan" },
  { key: "showSku", label: "SKU item" },
  { key: "showPaymentMethod", label: "Metode bayar" },
  { key: "showTax", label: "Baris pajak" },
]

export default function InvoiceBuilderView() {
  const { user } = useApp()
  const { data, loading, refresh } = useApi<{ data: InvoiceTemplateDTO[] }>("/api/invoice-templates")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [config, setConfig] = useState<InvoiceTemplateConfig | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const printInvoice = usePrintInvoice(config?.paperSize ?? "80mm")

  const templates = data?.data ?? []
  const selected = templates.find((t) => t.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId && templates.length) {
      setSelectedId(templates[0].id)
    }
  }, [templates, selectedId])

  useEffect(() => {
    if (selected) {
      setName(selected.name)
      setConfig({ ...selected.config })
      setDirty(false)
    }
  }, [selectedId, selected])

  const store: InvoiceStore = useMemo(
    () => ({
      businessName: user.tenant?.businessName ?? "Nama Toko",
      address: user.tenant?.address ?? "Alamat toko Anda",
      phone: user.tenant?.phone ?? "628123000000",
      whatsappNumber: user.tenant?.whatsappNumber ?? null,
      logoUrl: user.tenant?.logoUrl ?? null,
    }),
    [user.tenant]
  )

  function patchConfig(patch: Partial<InvoiceTemplateConfig>) {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev))
    setDirty(true)
  }

  async function handleSave() {
    if (!config || !name.trim()) return
    setSaving(true)
    try {
      await api.patch(`/api/invoice-templates/${selectedId}`, {
        name: name.trim(),
        config,
      })
      toast.success(`Template "${name.trim()}" disimpan.`)
      setDirty(false)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menyimpan template.")
    } finally {
      setSaving(false)
    }
  }

  async function handleSetDefault() {
    if (!selectedId) return
    try {
      await api.patch(`/api/invoice-templates/${selectedId}`, { action: "set_default" })
      toast.success(`Template "${name}" dijadikan default nota.`)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal mengubah default.")
    }
  }

  async function handleDuplicate() {
    if (!config || !selected) return
    try {
      const created = await api.post<InvoiceTemplateDTO>("/api/invoice-templates", {
        name: `${selected.name} (salinan)`,
        config,
      })
      toast.success("Template diduplikasi.")
      setSelectedId(created.id)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menduplikasi template.")
    }
  }

  async function handleDelete() {
    if (!selectedId) return
    try {
      await api.del(`/api/invoice-templates/${selectedId}`)
      toast.success("Template dihapus.")
      setSelectedId(null)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menghapus template.")
    }
  }

  async function handleNew() {
    try {
      const created = await api.post<InvoiceTemplateDTO>("/api/invoice-templates", {
        name: "Template Baru",
        config: {
          paperSize: "80mm",
          showLogo: true,
          showAddress: true,
          showPhone: true,
          showCustomer: true,
          showCustomerPhone: false,
          showSku: false,
          showPaymentMethod: true,
          showTax: true,
          headerText: "",
          footerText: "Terima kasih telah berbelanja",
          accentColor: "#111827",
          fontSize: 12,
          lineSpacing: 1.2,
          invoiceTitle: "NOTA PENJUALAN",
        },
      })
      toast.success("Template baru dibuat.")
      setSelectedId(created.id)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal membuat template.")
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Nota &amp; Template"
        description="Kustomisasi nota Anda — ukuran kertas, field yang tampil, teks, dan warna. Preview langsung sama dengan hasil cetak."
        actions={
          <>
            <Button variant="outline" onClick={printInvoice}>
              Tes Cetak
            </Button>
            <Button variant="outline" onClick={handleDuplicate} disabled={!selected}>
              <Copy className="size-4" />
              Duplikat
            </Button>
            <Button onClick={handleNew}>
              <Plus className="size-4" />
              Template Baru
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="grid lg:grid-cols-[260px_1fr_360px] gap-5">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[240px_minmax(0,1fr)_380px] gap-5 items-start">
          {/* Daftar template */}
          <Card className="p-2">
            <p className="text-xs font-semibold text-muted-foreground px-3 pt-2 pb-1.5 uppercase tracking-wide">Template</p>
            <ul className="space-y-1">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${
                      selectedId === t.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"
                    }`}
                    aria-pressed={selectedId === t.id}
                  >
                    <span className="truncate flex-1">{t.name}</span>
                    {t.isDefault && <Star className="size-3.5 fill-primary text-primary shrink-0" aria-label="default" />}
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {/* Form konfigurasi */}
          <Card className="p-5 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Nama template</Label>
              <Input id="tpl-name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true) }} maxLength={60} />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ukuran kertas</Label>
                <Select value={config?.paperSize ?? "80mm"} onValueChange={(v) => patchConfig({ paperSize: v as PaperSize })}>
                  <SelectTrigger aria-label="Ukuran kertas">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="58mm">Thermal 58mm</SelectItem>
                    <SelectItem value="80mm">Thermal 80mm</SelectItem>
                    <SelectItem value="A4">A4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-accent">Warna aksen</Label>
                <div className="flex gap-2">
                  <input
                    id="tpl-accent"
                    type="color"
                    value={config?.accentColor ?? "#111827"}
                    onChange={(e) => patchConfig({ accentColor: e.target.value })}
                    className="h-9 w-12 rounded-md border cursor-pointer bg-card"
                    aria-label="Pilih warna aksen"
                  />
                  <Input value={config?.accentColor ?? ""} onChange={(e) => patchConfig({ accentColor: e.target.value })} className="tabular" />
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tpl-title">Judul nota</Label>
                <Input id="tpl-title" value={config?.invoiceTitle ?? ""} onChange={(e) => patchConfig({ invoiceTitle: e.target.value })} maxLength={60} placeholder="NOTA PENJUALAN" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-header">Teks header</Label>
                <Input id="tpl-header" value={config?.headerText ?? ""} onChange={(e) => patchConfig({ headerText: e.target.value })} maxLength={200} placeholder="opsional — di bawah nama toko" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-footer">Teks footer</Label>
              <Input id="tpl-footer" value={config?.footerText ?? ""} onChange={(e) => patchConfig({ footerText: e.target.value })} maxLength={300} placeholder="Terima kasih telah berbelanja" />
            </div>

            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3.5">
              {TOGGLES.map((t) => (
                <div key={String(t.key)} className="flex items-center justify-between rounded-lg border px-3.5 py-2.5">
                  <Label htmlFor={`toggle-${String(t.key)}`} className="text-sm font-normal cursor-pointer">{t.label}</Label>
                  <Switch
                    id={`toggle-${String(t.key)}`}
                    checked={Boolean(config?.[t.key])}
                    onCheckedChange={(v) => patchConfig({ [t.key]: v } as Partial<InvoiceTemplateConfig>)}
                  />
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2.5">
                <Label>Ukuran font ({config?.fontSize ?? 12}px)</Label>
                <Slider
                  min={8}
                  max={18}
                  step={1}
                  value={[config?.fontSize ?? 12]}
                  onValueChange={([v]) => patchConfig({ fontSize: v })}
                  aria-label="Ukuran font"
                />
              </div>
              <div className="space-y-2.5">
                <Label>Jarak baris ({config?.lineSpacing ?? 1.2})</Label>
                <Slider
                  min={1}
                  max={1.8}
                  step={0.05}
                  value={[config?.lineSpacing ?? 1.2]}
                  onValueChange={([v]) => patchConfig({ lineSpacing: Math.round(v * 100) / 100 })}
                  aria-label="Jarak baris"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              <Button onClick={handleSave} disabled={!dirty || saving || !name.trim()}>
                <Save className="size-4" />
                {saving ? "Menyimpan…" : dirty ? "Simpan perubahan" : "Tersimpan"}
              </Button>
              <Button variant="outline" onClick={handleSetDefault} disabled={!selected || selected.isDefault}>
                <Star className="size-4" />
                Jadikan Default
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive hover:text-destructive" disabled={!selected || selected.isDefault || templates.length <= 1}>
                    <Trash2 className="size-4" />
                    Hapus
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus template &ldquo;{name}&rdquo;?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Template yang dihapus tidak dapat dikembalikan. Template default tidak dapat dihapus.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Ya, hapus
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Card>

          {/* Live preview */}
          <Card className="p-4 bg-muted/40">
            <p className="text-xs font-semibold text-muted-foreground mb-3 text-center uppercase tracking-wide">
              Live preview — data contoh
            </p>
            {config ? (
              <div className="overflow-auto max-h-[70vh] rounded-lg bg-white border p-3 flex justify-center">
                <InvoiceRenderer transaction={SAMPLE_TX} config={config} store={store} />
              </div>
            ) : (
              <Skeleton className="h-96" />
            )}
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Nota dicetak lewat print dialog browser — pilih printer thermal atau simpan PDF.
            </p>
          </Card>
        </div>
      )}

      {/* Elemen print (off-screen) — hanya tampil saat print */}
      {config && (
        <div className="invoice-print" style={{ position: "fixed", top: 0, left: "-10000px", zIndex: -1 }} aria-hidden="true">
          <InvoiceRenderer transaction={SAMPLE_TX} config={config} store={store} />
        </div>
      )}
    </div>
  )
}
