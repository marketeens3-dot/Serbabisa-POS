// Field form pelanggan (dipakai form dialog & form di POS).
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type CustomerFormValues = {
  name: string
  phone: string
  email: string
  address: string
  notes: string
}

export function CustomerFormFields({
  values,
  onChange,
}: {
  values: CustomerFormValues
  onChange: (v: CustomerFormValues) => void
}) {
  const set = (key: keyof CustomerFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...values, [key]: e.target.value })

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="cf-name">Nama *</Label>
        <Input id="cf-name" value={values.name} onChange={set("name")} placeholder="cth: Budi Santoso" autoFocus required minLength={2} maxLength={150} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cf-phone">Nomor HP / WhatsApp</Label>
          <Input id="cf-phone" value={values.phone} onChange={set("phone")} placeholder="08xxxxxxx" inputMode="tel" maxLength={30} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cf-email">Email</Label>
          <Input id="cf-email" type="email" value={values.email} onChange={set("email")} placeholder="opsional" maxLength={254} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cf-address">Alamat</Label>
        <Input id="cf-address" value={values.address} onChange={set("address")} placeholder="opsional" maxLength={500} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cf-notes">Catatan</Label>
        <Textarea id="cf-notes" value={values.notes} onChange={set("notes")} rows={2} placeholder="opsional — mis: langganan langanan" maxLength={2000} />
      </div>
    </>
  )
}
