// POST /api/upload — upload logo toko (multipart). Validasi berlapis:
//   magic bytes (bukan sekadar extension) via sharp, input hingga 10MB lalu DIKECILKAN
//   (resize 512x512 + re-encode WebP/PNG, strip metadata/EXIF) sampai hasil <= 300KB,
//   hanya PNG/JPG/WEBP, disimpan sebagai data URL di database (stateless, tidak menulis
//   filesystem server). Batas 300KB berlaku pada HASIL KOMPRESI, bukan file asli —
//   file asli > 300KB justru yang paling membutuhkan diproses.
//
// Kenapa WebP: logo ikut setiap payload tenant (login, sync, bootstrap HP) dan
// menempati kuota DB Supabase free (500 MB). WebP lossless ~25-40% lebih kecil
// dari PNG level-9, WebP lossy q82 dari JPEG biasanya ~60-75% lebih kecil.
// PNG input memakai lossless supaya teks/transparansi logo tetap tajam.
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, MAX_LOGO_BYTES, MAX_LOGO_UPLOAD_BYTES } from '@/lib/constants'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError('INVALID_INPUT', 'File logo wajib dipilih.', 422)
    // Batas input longgar (10MB): kompresi sharp di bawah yang mengecilkan.
    if (file.size > MAX_LOGO_UPLOAD_BYTES) {
      throw new ApiError('FILE_TOO_LARGE', 'Ukuran logo maksimal 10MB. File akan dikompres otomatis setelah diunggah.', 413)
    }
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      throw new ApiError('INVALID_FILE_TYPE', 'Logo hanya boleh PNG, JPG, atau WEBP.', 415)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) throw new ApiError('INVALID_INPUT', 'File kosong.', 422)

    // sharp melempar error untuk gambar invalid → menolak file menyamar (PHP/EXE/SVG-script).
    let pipeline = sharp(buffer, { failOn: 'error', limitInputPixels: 12_000_000 })
    const meta = await pipeline.metadata()
    if (!meta.format || !['png', 'jpeg', 'webp'].includes(meta.format)) {
      throw new ApiError('INVALID_FILE_TYPE', 'Format gambar tidak didukung.', 415)
    }
    // Resize (maks 512×512, tanpa pembesaran) + re-encode → strip metadata & seragamkan.
    // Target utama WebP: PNG (logo: teks + transparansi) memakai lossless agar tajam,
    // JPEG/WEBP foto memakai lossy q82. Sebagai jaminan kuota, PNG level-9 juga di-
    // encode lalu dipilih hasil yang LEBIH KECIL — untuk logo flat sederhana WebP
    // lossless kadang sedikit lebih besar, dan fallback itu tetap ≥ hemat seperti
    // perilaku lama (PNG-9). Konsumen (img HTML, validasi DATA_URL_IMAGE, sync, HP)
    // sudah menerima image/webp maupun image/png.
    const useLossless = meta.format === 'png'
    const encode = async (size: number, quality: number) => {
      const resized = pipeline.resize(size, size, { fit: 'inside', withoutEnlargement: true })
      const [webpOut, pngOut] = await Promise.all([
        resized.clone().webp(useLossless && quality >= 82 ? { lossless: true, effort: 5 } : { quality, effort: 5 }).toBuffer(),
        resized.clone().png({ compressionLevel: 9, palette: quality < 82 }).toBuffer(),
      ])
      const preferWebp = webpOut.length <= pngOut.length
      return { buffer: preferWebp ? webpOut : pngOut, isWebp: preferWebp }
    }

    // Pass pertama: kualitas terbaik (512px, q82/lossless).
    let result = await encode(512, 82)
    // Fallback bertingkat bila hasil tetap > 300KB (sangat jarang, mis. gambar berisik/full-detail):
    // perkecil dimensi + turunkan kualitas sampai muat kuota.
    const FALLBACKS: Array<[number, number]> = [[384, 70], [256, 60], [192, 50]]
    for (const [size, quality] of FALLBACKS) {
      if (result.buffer.length <= MAX_LOGO_BYTES) break
      result = await encode(size, quality)
    }
    const output = result.buffer
    const isWebp = result.isWebp
    if (output.length > MAX_LOGO_BYTES) {
      throw new ApiError('FILE_TOO_LARGE', 'Logo terlalu besar setelah diproses. Gunakan gambar lebih sederhana.', 413)
    }
    const dataUrl = `data:image/${isWebp ? 'webp' : 'png'};base64,${output.toString('base64')}`

    await db.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { logoUrl: dataUrl } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.STORE_LOGO_UPDATED,
        resourceType: 'Tenant', resourceId: tenantId,
        metadata: { bytes: output.length, width: meta.width, height: meta.height, originalFormat: meta.format, outputFormat: isWebp ? 'webp' : 'png', outputLossless: isWebp ? useLossless : true, originalBytes: file.size },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })

    return NextResponse.json({ logoUrl: dataUrl })
  } catch (err) {
    // sharp melempar error khusus untuk file bukan gambar.
    if (err instanceof Error && (err.message.includes('Input buffer contains unsupported image format') || err.message.includes('unsupported image format'))) {
      return NextResponse.json({ error: 'INVALID_FILE_TYPE', message: 'File bukan gambar yang valid.' }, { status: 415 })
    }
    return handleApiError(err)
  }
}
