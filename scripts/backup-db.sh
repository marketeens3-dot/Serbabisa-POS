#!/usr/bin/env bash
# Backup harian database PRODUKSI (Supabase / PostgreSQL) — pg_dump logis.
# Supabase plan FREE tidak menyertakan backup otomatis; skrip ini menutup celah
# tersebut: dump terkompresi + retensi + uji integritas gzip.
#
# Pemakaian:
#   DATABASE_URL="postgresql://...supabase.co:5432/postgres" bash scripts/backup-db.sh
#   BACKUP_DIR=./backups RETENTION_DAYS=14 bash scripts/backup-db.sh
#
# Jadwalkan via cron (server/VPS/CI) — bukan di Vercel (serverless tidak punya cron filesystem):
#   0 3 * * * cd /app && DATABASE_URL="$PROD_DB" bash scripts/backup-db.sh >> logs/backup.log 2>&1
#
# Restore (uji berkala!):
#   gunzip -c serbabisa-XXXX.sql.gz | psql "$DATABASE_URL_BERSIH"
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL wajib di-set (connection string PRODUKSI — jangan pakai pooler port 6543 untuk pg_dump, gunakan port 5432)}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/serbabisa-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# --no-owner --no-privileges agar restore tidak tergantung role owner.
if ! pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip -9 > "$OUT"; then
  echo "[backup] GAGAL — pg_dump error. File parsial dihapus." >&2
  rm -f "$OUT"
  exit 1
fi

# Uji integritas arsip.
gzip -t "$OUT" || { echo "[backup] GAGAL — arsip korup." >&2; exit 1; }

echo "[backup] OK: $OUT ($(du -h "$OUT" | cut -f1))"

# Hapus backup melewati retensi.
find "$BACKUP_DIR" -name 'serbabisa-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Retensi: backup > ${RETENTION_DAYS} hari dihapus."
