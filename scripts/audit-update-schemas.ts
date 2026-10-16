// Audit empiris: skema mana yang "menghidupkan" field saat input parsial?
// Prinsip: parse({}) atau parse({satuField}) TIDAK BOLEH menambah field lain.
import {
  settingsSchema,
  updateUserSchema,
  customerUpdateSchema,
  categoryUpdateSchema,
  catalogItemSchema,
  customerSchema,
  profileSchema,
} from "@/lib/validation";

function probe(name: string, schema: { parse: (i: unknown) => Record<string, unknown> }, input: Record<string, unknown>) {
  try {
    const out = schema.parse(input);
    const keys = Object.keys(out);
    const extra = keys.filter((k) => !(k in input));
    console.log(
      `${extra.length ? "×  " : "OK "} ${name} input={${Object.keys(input).join(",") || "kosong"}} → extra: [${extra.join(",")}]`
    );
  } catch (e) {
    console.log(`?  ${name} parse error: ${(e as Error).message.slice(0, 80)}`);
  }
}

// settingsSchema: PATCH /api/settings (parsial — BUG terkonfirmasi)
probe("settingsSchema      ", settingsSchema, { logoUrl: null });
probe("settingsSchema      ", settingsSchema, { whatsappTemplate: "x" });

// updateUserSchema: PATCH /api/admin/users/[id] (parsial)
probe("updateUserSchema    ", updateUserSchema, { fullName: "Budi" });

// customerUpdateSchema: PATCH /api/customers/[id] (parsial)
probe("customerUpdateSchema", customerUpdateSchema, { name: "Ibu Sari" });

// categoryUpdateSchema: PATCH /api/categories/[id] (parsial)
probe("categoryUpdateSchema", categoryUpdateSchema, { name: "Makanan" });

// Referensi: skema CREATE (full-save, transform → null memang diinginkan)
probe("catalogItemSchema   ", catalogItemSchema, { type: "PRODUCT", name: "Kopi", sellingPrice: 5000 });
probe("customerSchema      ", customerSchema, { name: "Ibu Sari", phone: "081234567890" });
probe("profileSchema       ", profileSchema, { fullName: "Kasir Demo", phone: "081234567890" });
