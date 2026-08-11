#!/usr/bin/env bash
# Backup Postgres da clínica (API). Uso: ./scripts/backup-db.sh
# Requer: pg_dump no PATH e DATABASE_URL no ambiente (ou .env).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  # Lê só DATABASE_URL sem executar o restante
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2- | sed 's/^"//;s/"$//')"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL não definida" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/clinica-$STAMP.sql.gz"

echo "Backup → $OUT_FILE"
pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip -c > "$OUT_FILE"
echo "OK ($(du -h "$OUT_FILE" | cut -f1))"

# Retenção: mantém os 14 mais recentes
ls -1t "$OUT_DIR"/clinica-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
