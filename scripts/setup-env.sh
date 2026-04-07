#!/usr/bin/env bash
# Creates .env in the project root (run from repo root: bash scripts/setup-env.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.env"
URL='DATABASE_URL="postgresql://tif:tif@localhost:5433/traffic_intel?schema=public"'
printf '%s\n' "$URL" > "$OUT"
echo "Wrote $OUT"
