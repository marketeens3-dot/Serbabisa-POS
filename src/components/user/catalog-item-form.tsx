// Form dialog tambah/ubah produk & jasa — react-hook-form + Zod (pesan error dekat field).
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, ApiClientError } from "@/lib/api-client";
import type { CatalogItemDTO, CategoryDTO } from "@/lib/types";

const formSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(150, "Nama terlalu panjang"),
  sku: z.string().trim().max(50, "SKU terlalu panjang").optional().or(z.literal("")),
  barcode: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]*$/, "Barcode hanya boleh huruf, angka, dan strip")
    .max(64, "Barcode terlalu panjang")
    .optional()
    .or(z.literal("")),
  categoryId: z.string().optional(),
  sellingPrice: z.coerce.number({ message: "Harga jual wajib diisi" }).int("Harga harus bilangan bulat rupiah").min(0, "Harga tidak boleh negatif").max(1_000_000_000, "Harga terlalu besar"),
  // Diskon per unit (Rp): harga jadi = harga jual − diskon (cth: 9.500 − 2.500 = 7.000).
  discountPrice: z.coerce.number().int("Harga harus bilangan bulat rupiah").min(0, "Diskon tidak boleh negatif").max(1_000_000_000, "Diskon terlalu besar").default(0),
  costPrice: z.coerce.number().int("Harga harus bilangan bulat rupiah").min(0, "Harga tidak boleh negatif").max(1_000_000_000).default(0),
  stockQty: z.coerce.number().min(0, "Stok tidak boleh negatif").max(100_000, "Stok terlalu besar").default(0),
  minStockQty: z.coerce.number().min(0, "Stok minimum tidak boleh negatif").max(100_000).default(0),
  unit: z.string().trim().max(20, "Satuan terlalu panjang").default("pcs"),
  description: z.string().trim().max(1000, "Deskripsi terlalu panjang").optional().or(z.literal("")),
  isActive: z.boolean().default(true),
})

type FormValues = z.infer<typeof formSchema>

export function CatalogItemFormDialog({
  open,
  onOpenChange,
  type,
  item,
  categories,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  type: "PRODUCT" | "SERVICE"
  item: CatalogItemDTO | null
  categories: CategoryDTO[]
  onSaved: () => void
}) {
  const isProduct = type === "PRODUCT"
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    // Validasi via formSchema di onSubmit — kompatibel penuh dengan Zod 4 (tanpa resolver type-gymnastics).
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      categoryId: undefined,
      sellingPrice: 0,
      discountPrice: 0,
      costPrice: 0,
      stockQty: 0,
      minStockQty: 0,
      unit: "pcs",
      description: "",
      isActive: true,
    },
  })

  useEffect(() => {
    if (open) {
      setError(null)
      form.reset({
        name: item?.name ?? "",
        sku: item?.sku ?? "",
        barcode: item?.barcode ?? "",
        categoryId: item?.categoryId ?? undefined,
        sellingPrice: item?.sellingPrice ?? 0,
        discountPrice: item?.discountAmount ?? 0,
        costPrice: 0,
        stockQty: item?.stockQty ?? 0,
        minStockQty: item?.minStockQty ?? 0,
        unit: item?.unit ?? "pcs",
        description: item?.description ?? "",
        isActive: item?.isActive ?? true,
      })
    }
  }, [open, item, form])

  async function onSubmit(raw: FormValues) {
    // Validasi server-style dengan Zod — error dipetakan ke field terkait.
    const parsed = formSchema.safeParse(raw)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "") as keyof FormValues
        if (key) form.setError(key, { message: issue.message })
      }
      return
    }
    const values = parsed.data
    if (values.discountPrice >= values.sellingPrice && values.sellingPrice > 0) {
      form.setError("discountPrice", { message: "Diskon harus lebih kecil dari harga jual" })
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      type,
      name: values.name,
      sku: values.sku || null,
      barcode: values.barcode || null,
      categoryId: values.categoryId || null,
      sellingPrice: values.sellingPrice,
      discountAmount: values.discountPrice,
      costPrice: values.costPrice,
      stockQty: isProduct ? values.stockQty : 0,
      minStockQty: isProduct ? values.minStockQty : 0,
      unit: values.unit || "pcs",
      description: values.description || null,
      isActive: values.isActive,
    }
    try {
      if (item) {
        await api.patch(`/api/catalog/${item.id}`, payload)
        toast.success(`${isProduct ? "Produk" : "Jasa"} "${values.name}" berhasil diperbarui.`)
      } else {
        await api.post("/api/catalog", payload)
        toast.success(`${isProduct ? "Produk" : "Jasa"} "${values.name}" berhasil ditambahkan.`)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Gagal menyimpan. Silakan coba lagi.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? "Ubah" : "Tambah"} {isProduct ? "Produk" : "Jasa"}
          </DialogTitle>
          <DialogDescription>
            {isProduct ? "Produk memiliki stok dan bisa punya SKU/barcode." : "Jasa tidak mengurangi stok."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">
                {error}
              </p>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama {isProduct ? "produk" : "jasa"} *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={isProduct ? "cth: Air Mineral 600ml" : "cth: Jasa Servis Ringan"} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU (opsional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="AIR-600" className="uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isProduct && (
                <FormField
                  control={form.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Barcode (opsional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="8991234567890" inputMode="numeric" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kategori (opsional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih kategori" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sellingPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Harga jual (Rp) *</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} step={1} inputMode="numeric" placeholder="9500" className="tabular" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discountPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Diskon (Rp)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} step={1} inputMode="numeric" placeholder="0" className="tabular" />
                    </FormControl>
                    <FormDescription>
                      {(() => {
                        const price = Number(form.watch("sellingPrice")) || 0
                        const disc = Number(form.watch("discountPrice")) || 0
                        if (disc <= 0) return "Tanpa diskon — harga normal di kasir."
                        if (disc >= price && price > 0) return "Diskon melebihi harga jual."
                        return `Harga jadi: Rp ${(price - disc).toLocaleString("id-ID")} / ${form.watch("unit") || "pcs"}`
                      })()}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Satuan</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={isProduct ? "pcs / kg / dus" : "jasa / sesi"} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {isProduct && (
              <div className="grid sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="stockQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stok</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0} step="0.001" inputMode="decimal" className="tabular" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minStockQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stok minimum</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0} step="0.001" inputMode="decimal" className="tabular" />
                      </FormControl>
                      <FormDescription>Peringatan stok menipis</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="costPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Harga beli (Rp)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0} step={1} inputMode="numeric" className="tabular" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deskripsi (opsional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} maxLength={1000} placeholder="Catatan singkat item…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3.5">
                  <div className="space-y-0.5">
                    <FormLabel>Aktif</FormLabel>
                    <FormDescription>Item aktif tampil di halaman kasir.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Status aktif" />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {item ? "Simpan perubahan" : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
