// Helper Supabase Storage via REST — tanpa SDK supaya bundle tetap ramping.
// Kenapa Storage (bukan data URL seperti logo): gambar produk bisa dimiliki
// RATUSAN item — data URL ikut setiap payload daftar katalog, sync, dan
// bootstrap HP (terlalu berat). URL publik hanya +~60 karakter per item di
// JSON, gambar sendiri di-cache browser & CDN Supabase.
//
// Hasil upload selalu WebP (konversi sharp di endpoint gambar produk).
import { PRODUCT_IMAGE_BUCKET } from "@/lib/constants"

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY

/** Storage tersedia bila kedua kunci env ada (tanpa keduanya → endpoint menolak). */
export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY)
}

/** Path objek dalam bucket — stabil per item (overwrite saat ganti gambar). */
export function productObjectPath(tenantId: string, itemId: string): string {
  return `${tenantId}/${itemId}.webp`
}

/** URL publik objek (tanpa versi cache — versi ditambahkan pemanggil). */
function publicBaseUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${path}`
}

// Pastikan bucket ada — di-cache supaya tidak dicek per upload.
let bucketReady: Promise<void> | null = null
async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      // Coba buat bucket publik; bila sudah ada (409) dianggap sukses.
      const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: PRODUCT_IMAGE_BUCKET, public: true }),
      })
      if (res.ok) return
      const bodyText = await res.text().catch(() => "")
      if (res.status === 409 || /already|exists/i.test(bodyText)) return
      throw new Error(`Gagal menyiapkan bucket gambar (${res.status}).`)
    })().catch((err) => {
      bucketReady = null // reset agar percobaan berikutnya mencoba lagi
      throw err
    })
  }
  return bucketReady
}

/**
 * Upload (upsert) objek WebP. Path stabil per item + x-upsert: true, sehingga
 * mengganti gambar menimpa objek lama — tidak menumpukkan file di bucket.
 * URL yang disimpan DB diberi versi (?v=<timestamp>) oleh endpoint agar cache
 * browser/CDN tidak menyajikan gambar lama.
 */
export async function uploadProductImage(path: string, buffer: Buffer): Promise<string> {
  await ensureBucket()
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${PRODUCT_IMAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "Content-Type": "image/webp",
      "x-upsert": "true",
    },
    body: new Uint8Array(buffer),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Gagal mengunggah gambar (${res.status}).${detail ? " " + detail.slice(0, 140) : ""}`)
  }
  return publicBaseUrl(path)
}

/** Hapus objek — best-effort (gagal diabaikan: soft-delete item, URL tak dipakai lagi). */
export async function deleteProductImage(path: string): Promise<void> {
  try {
    await ensureBucket()
    await fetch(`${SUPABASE_URL}/storage/v1/object/${PRODUCT_IMAGE_BUCKET}/${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SUPABASE_SECRET_KEY}` },
    })
  } catch {
    // Sengaja diam: kegagalan hapus tidak boleh menggagalkan alur utama.
  }
}
