#!/usr/bin/env bash
set -euo pipefail

# Respaldo de TODAS las bases Postgres de Supabase y PocketBase (Insumos O2) en la VPS.
#
# Cada contenedor se respalda en su propio prefijo, local y en Backblaze B2:
#   ~/backups/<contenedor>/db_<fecha>.sql.gz  o  pb_<fecha>.tar.gz
#   b2:edsonpedraza-vps-backups/<contenedor>/

BACKUP_ROOT="$HOME/backups"
RETENTION_DAYS=14
RCLONE="/home/chato/bin/rclone"
RCLONE_CONF="/home/chato/.config/rclone/rclone.conf"
B2_BUCKET="b2:edsonpedraza-vps-backups"
DISCOVER_PATTERN='^supabase.*-db$'   # supabase-db, supabase-worshipstage-db, supabase-<proj>-db...
STAMP="$(date +%F_%H%M)"

# Secretos compartidos para avisar por Telegram si algo falla (opcional).
SECRETS_FILE="$HOME/scripts/.secrets.env"
# shellcheck disable=SC1090
[ -f "$SECRETS_FILE" ] && source "$SECRETS_FILE"

notify_fail() {
  [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ] || return 0
  curl -s -m 15 \
    --data-urlencode "chat_id=${TG_CHAT}" \
    --data-urlencode "text=🔴 [$(hostname)] Backup FALLÓ: $1" \
    "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" >/dev/null 2>&1 || true
}

# --- 1. Postgres Supabase containers ---
mapfile -t CONTAINERS < <(docker ps --format '{{.Names}}' | grep -E "$DISCOVER_PATTERN" | sort || true)

FAILED=0

if [ "${#CONTAINERS[@]}" -gt 0 ]; then
  echo "[$(date)] Respaldando Postgres: ${CONTAINERS[*]}"
  for c in "${CONTAINERS[@]}"; do
    dir="$BACKUP_ROOT/$c"
    file="$dir/db_${STAMP}.sql.gz"
    remote="$B2_BUCKET/$c"
    mkdir -p "$dir"
    echo "[$(date)] Respaldando $c ..."

    if ! docker exec "$c" pg_dumpall -U postgres | gzip > "$file"; then
      echo "[$(date)] ERROR: pg_dumpall falló para $c"
      rm -f "$file"; notify_fail "$c (pg_dumpall)"; FAILED=1; continue
    fi
    if [ ! -s "$file" ]; then
      echo "[$(date)] ERROR: dump vacío para $c"
      rm -f "$file"; notify_fail "$c (dump vacío)"; FAILED=1; continue
    fi

    # Retención local
    find "$dir" -name 'db_*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

    # Off-site a B2
    if [ -x "$RCLONE" ]; then
      if "$RCLONE" --config "$RCLONE_CONF" copy "$file" "$remote/"; then
        "$RCLONE" --config "$RCLONE_CONF" delete --min-age "${RETENTION_DAYS}d" \
          "$remote/" --include 'db_*.sql.gz' || true
        echo "[$(date)] $c -> off-site OK ($(du -h "$file" | cut -f1))"
      else
        echo "[$(date)] ERROR: rclone falló para $c"
        notify_fail "$c (off-site/rclone)"; FAILED=1
      fi
    else
      echo "[$(date)] WARN: rclone no encontrado, se omite off-site"
    fi
  done
fi

# --- 2. PocketBase (Insumos O2) ---
POCKETBASE_CONTAINER="insumoso2-api"
if docker ps --format '{{.Names}}' | grep -q "^${POCKETBASE_CONTAINER}$"; then
  dir="$BACKUP_ROOT/$POCKETBASE_CONTAINER"
  file="$dir/pb_${STAMP}.tar.gz"
  remote="$B2_BUCKET/$POCKETBASE_CONTAINER"
  mkdir -p "$dir"
  echo "[$(date)] Respaldando $POCKETBASE_CONTAINER (PocketBase) ..."

  if docker exec "$POCKETBASE_CONTAINER" tar -czf - -C /pb pb_data > "$file" && [ -s "$file" ]; then
    echo "[$(date)] $POCKETBASE_CONTAINER dump OK ($(du -h "$file" | cut -f1))"
    find "$dir" -name 'pb_*.tar.gz' -mtime "+$RETENTION_DAYS" -delete

    if [ -x "$RCLONE" ]; then
      if "$RCLONE" --config "$RCLONE_CONF" copy "$file" "$remote/"; then
        "$RCLONE" --config "$RCLONE_CONF" delete --min-age "${RETENTION_DAYS}d" \
          "$remote/" --include 'pb_*.tar.gz' || true
        echo "[$(date)] $POCKETBASE_CONTAINER -> off-site B2 OK"
      else
        echo "[$(date)] ERROR: rclone falló para $POCKETBASE_CONTAINER"
        notify_fail "$POCKETBASE_CONTAINER (off-site/rclone)"; FAILED=1
      fi
    else
      echo "[$(date)] WARN: rclone no encontrado, se omite off-site"
    fi
  else
    echo "[$(date)] ERROR: dump falló para $POCKETBASE_CONTAINER"
    rm -f "$file"
    notify_fail "$POCKETBASE_CONTAINER (tar dump)"
    FAILED=1
  fi
fi

echo "[$(date)] Backup completado (fallos: $FAILED)"
exit "$FAILED"
