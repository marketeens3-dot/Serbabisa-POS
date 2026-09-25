// Helper pembentuk daftar item untuk pesan WhatsApp (dipisah agar whatsapp.ts tetap isomorphic ringan).

export type WaItemLine = { name: string; qty: string; price: string }

export function buildMessageItems(items: WaItemLine[]): string {
  return items.map((it) => `- ${it.name} x${it.qty} = ${it.price}`).join('\n')
}
