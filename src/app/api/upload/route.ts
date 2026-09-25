// POST /api/upload — upload logo toko (multipart). Validasi berlapis:
//   magic bytes (bukan sekadar extension) via sharp, maksimal 300KB,
//   hanya PNG/JPG/WEBP, di-resize + re-encode (strip metadata/EXIF), disimpan sebagai
//   data URL di database (stateless, tidak menulis filesystem server).
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, MAX_LOGO_BYTES } from '@/lib/constants'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError('INVALID_INPUT', 'File logo wajib dipilih.', 422)
    if (file.size > MAX_LOGO_BYTES) {
      throw new ApiError('FILE_TOO_LARGE', 'Ukuran logo maksimal 300KB.', 413)
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
    // Resize (maks 512×512, tanpa pembesaran) + re-encode PNG → strip metadata & seragamkan.
    const output = await pipeline.resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
    if (output.length > MAX_LOGO_BYTES) {
      throw new ApiError('FILE_TOO_LARGE', 'Logo terlalu besar setelah diproses. Gunakan gambar lebih sederhana.', 413)
    }
    const dataUrl = `data:image/png;base64,${output.toString('base64')}`

    await db.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { logoUrl: dataUrl } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.STORE_LOGO_UPDATED,
        resourceType: 'Tenant', resourceId: tenantId,
        metadata: { bytes: output.length, width: meta.width, height: meta.height, originalFormat: meta.format },
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
