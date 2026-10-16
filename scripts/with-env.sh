#!/bin/bash
# with-env.sh — muat .env proyek sebagai ENV proses (menimpa env warisan sandbox),
# lalu jalankan perintah yang diberikan.
#
# Latar: sandbox menyuntik DATABASE_URL=file:/... global, sedangkan dotenv/Next.js
# TIDAK menimpa env yang sudah ada. Wrapper ini memaksa nilai .env menang, sehingga
# `bun run dev` dan `bun run db:push` selalu tersambung ke Supabase (mode cloud).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env"
  set +a
fi

exec "$@"
