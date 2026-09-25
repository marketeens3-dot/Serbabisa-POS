// One-off: isi barcode produk demo (EAN-13-like) untuk demo scanner di POS.
import { db } from '@/lib/db'

const barcodes: [string, string][] = [
  ['AIR-600', '8991002101234'],
  ['KPI-250', '8991002200117'],
  ['SNK-100', '8991003300220'],
]

async function main() {
  for (const [sku, barcode] of barcodes) {
    const r = await db.catalogItem.updateMany({ where: { sku }, data: { barcode } })
    console.log(`${sku} -> ${barcode} (${r.count} row)`)
  }
  const items = await db.catalogItem.findMany({
    where: { type: 'PRODUCT', isActive: true },
    select: { sku: true, name: true, barcode: true },
  })
  console.log(JSON.stringify(items, null, 1))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
