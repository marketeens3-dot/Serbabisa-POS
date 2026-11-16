// POST   /api/catalog/[id]/image — unggah/ganti gambar produk (multipart).
// DELETE /api/catalog/[id]/image — hapus gambar produk.
//
// Alur POST: validasi berlapis (magic bytes via sharp, input hingga 10MB) →
// DIKONVERSI OTOMATIS ke WebP (resize sisi maks 800px, strip metadata/EXIF,
// kualitas 80 + tangga fallback sampai hasil <= 200KB) → upsert ke Supabase
// Storage (path stabil per item: {tenantId}/{itemId}.webp, x-upsert) →
// simpan URL publik + versi cache (?v=<timestamp>) ke CatalogItem.imageUrl.
//
// Kenapa selalu WebP: kartu kasir & daftar produk memuat gambar per item —
// WebP lossy q80 dari foto biasanya 50-70% lebih kecil daripada JPEG, jadi
// daftar tetap ringan. URL publik di-cache CDN; versi (?v) memaksa cache
// browser menyegarkan saat gambar diganti.
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, PRODUCT_IMAGE_BUCKET, PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_UPLOAD_BYTES } from '@/lib/constants'
import { deleteProductImage, isStorageConfigured, productObjectPath, uploadProductImage } from '@/lib/storage'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

// Pesan yang sama dipakai di semua jalur STORAGE_UNCONFIGURED — menyebut env
// yang hilang & lokasi settingnya, supaya operator deployment (mis. Vercel)
// langsung tahu cara memperbaiki tanpa membuka log server.
const STORAGE_SETUP_HINT =
  'Penyimpanan gambar belum dikonfigurasi di server. Set SUPABASE_URL dan SUPABASE_SECRET_KEY pada Environment Variables (Vercel: Settings → Environment Variables, untuk Production + Preview), lalu redeploy.'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    if (!isStorageConfigured()) {
      throw new ApiError('STORAGE_UNCONFIGURED', STORAGE_SETUP_HINT, 503)
    }
    const { id } = await params

    const item = await db.catalogItem.findFirst({ where: { id, tenantId }, select: { id: true, name: true, imageUrl: true } })
    if (!item) throw new ApiError('ITEM_NOT_FOUND', 'Produk tidak ditemukan.', 404)

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError('INVALID_INPUT', 'File gambar wajib dipilih.', 422)
    if (file.size > PRODUCT_IMAGE_UPLOAD_BYTES) {
      throw new ApiError('FILE_TOO_LARGE', 'Ukuran gambar maksimal 10MB. File akan dikompres otomatis setelah diunggah.', 413)
    }
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      throw new ApiError('INVALID_FILE_TYPE', 'Gambar hanya boleh PNG, JPG, atau WEBP.', 415)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) throw new ApiError('INVALID_INPUT', 'File kosong.', 422)

    // sharp menolak file menyamar (PHP/EXE/SVG-script) — validasi magic bytes.
    const pipeline = sharp(buffer, { failOn: 'error', limitInputPixels: 24_000_000 })
    const meta = await pipeline.metadata()
    if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format)) {
      throw new ApiError('INVALID_FILE_TYPE', 'Format gambar tidak didukung.', 415)
    }

    // Konversi otomatis → WebP: resize (tanpa pembesaran) + q80 + strip metadata.
    const encode = async (size: number, quality: number) =>
      pipeline.clone().resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality, effort: 5 }).toBuffer()
    let output = await encode(PRODUCT_IMAGE_SIZE, 80)
    // Fallback bertingkat bila hasil > 200KB (foto berisik/full-detail).
    const FALLBACKS: Array<[number, number]> = [[640, 72], [480, 64], [384, 56]]
    for (const [size, quality] of FALLBACKS) {
      if (output.length <= PRODUCT_IMAGE_MAX_BYTES) break
      output = await encode(size, quality)
    }
    if (output.length > PRODUCT_IMAGE_MAX_BYTES) {
      throw new ApiError('FILE_TOO_LARGE', 'Gambar terlalu besar setelah diproses. Gunakan foto lebih sederhana.', 413)
    }

    const path = productObjectPath(tenantId, item.id)
    await uploadProductImage(path, output)
    // Versi cache: mengganti gambar menimpa objek dengan path sama — ?v= baru
    // membuat browser/CDN mengambil gambar terbaru.
    const imageUrl = `${await publicUrl(path)}?v=${Date.now()}`

    await db.$transaction(async (tx) => {
      await tx.catalogItem.update({ where: { id: item.id }, data: { imageUrl } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PRODUCT_IMAGE_UPDATED,
        resourceType: 'CatalogItem', resourceId: item.id,
        metadata: { bytes: output.length, width: meta.width, height: meta.height, originalFormat: meta.format, originalBytes: file.size, hadPrevious: Boolean(item.imageUrl) },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })

    return NextResponse.json({ imageUrl })
  } catch (err) {
    if (err instanceof Error && (err.message.includes('Input buffer contains unsupported image format') || err.message.includes('unsupported image format'))) {
      return NextResponse.json({ error: 'INVALID_FILE_TYPE', message: 'File bukan gambar yang valid.' }, { status: 415 })
    }
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    if (!isStorageConfigured()) {
      throw new ApiError('STORAGE_UNCONFIGURED', STORAGE_SETUP_HINT, 503)
    }
    const { id } = await params

    const item = await db.catalogItem.findFirst({ where: { id, tenantId }, select: { id: true, name: true, imageUrl: true } })
    if (!item) throw new ApiError('ITEM_NOT_FOUND', 'Produk tidak ditemukan.', 404)
    if (!item.imageUrl) throw new ApiError('NO_IMAGE', 'Produk ini belum memiliki gambar.', 404)

    // Hapus objek di storage (best-effort) lalu bersihkan kolom.
    await deleteProductImage(productObjectPath(tenantId, item.id))
    await db.$transaction(async (tx) => {
      await tx.catalogItem.update({ where: { id: item.id }, data: { imageUrl: null } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PRODUCT_IMAGE_DELETED,
        resourceType: 'CatalogItem', resourceId: item.id,
        metadata: { previousUrl: item.imageUrl },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })

    return NextResponse.json({ imageUrl: null })
  } catch (err) {
    return handleApiError(err)
  }
}

/** URL publik objek (base, tanpa versi) — memakai URL env yang sama dengan storage.ts. */
async function publicUrl(path: string): Promise<string> {
  const base = process.env.SUPABASE_URL
  if (!base) throw new ApiError('STORAGE_UNCONFIGURED', STORAGE_SETUP_HINT, 503)
  return `${base}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${path}`
}
