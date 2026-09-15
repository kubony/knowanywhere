#!/usr/bin/env bash
# pg-backup.sh: logical dump of the Outline database -> gzip -> local copy (30 days) -> GCS bucket.
#
# Usage (on the VM, as root or with sudo):
#   pg-backup.sh                       # bucket from BACKUP_BUCKET in /opt/outline/.env
#   pg-backup.sh gs://kna-wiki-a1b2-backups
#   pg-backup.sh --local-only          # dump to /var/backups/outline only (used by upgrade.sh)
#
# Step 11 installs it as /usr/local/bin/outline-pg-backup with a cron file. Step 03 set the VM's
# timezone to yours (timedatectl), so cron uses local time: 03:30 local. It runs 30 minutes
# after the daily disk snapshot (03:00 local) to avoid both hitting the disk at once.
#   /etc/cron.d/outline-backup:
#   30 3 * * * root /usr/local/bin/outline-pg-backup >> /var/log/outline-backup.log 2>&1
#
# The bucket has a 30-day lifecycle rule (lifecycle-30d.json), so old dumps expire there on their own.
# Attachments are not in the dump: they live in the uploads bucket.
set -euo pipefail

# cron's PATH lacks /snap/bin, where Ubuntu images keep gcloud.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"

INSTALL_DIR="${INSTALL_DIR:-/opt/outline}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/outline}"
KEEP_DAYS="${KEEP_DAYS:-30}"
# A dump of even an empty Outline database is far larger than this; smaller means something broke.
MIN_BYTES="${MIN_BYTES:-4096}"
CONTAINER="${PG_CONTAINER:-outline-postgres}"

BUCKET="${BACKUP_BUCKET:-}"
LOCAL_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --local-only) LOCAL_ONLY=1 ;;
    -h|--help)    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    -*)           echo "unknown option: $arg" >&2; exit 2 ;;
    *)            BUCKET="$arg" ;;
  esac
done
if [ -z "$BUCKET" ] && [ -r "$INSTALL_DIR/.env" ]; then
  BUCKET="$(grep -E '^BACKUP_BUCKET=' "$INSTALL_DIR/.env" | tail -n 1 | cut -d= -f2- || true)"
fi
BUCKET="${BUCKET#gs://}"; BUCKET="${BUCKET%/}"
if [ "$LOCAL_ONLY" = 0 ] && { [ -z "$BUCKET" ] || [[ "$BUCKET" == *CHANGE_ME* ]]; }; then
  echo "ERROR: no backups bucket. Pass gs://<bucket> or set BACKUP_BUCKET in $INSTALL_DIR/.env" >&2
  exit 1
fi

if docker info >/dev/null 2>&1; then DOCKER=(docker); else DOCKER=(sudo docker); fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
NAME="outline-${STAMP}.sql.gz"
OUT="$LOCAL_DIR/$NAME"
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT

mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"

# pg_dump runs inside the container, so the host needs no postgres client.
# --clean --if-exists makes the dump drop and recreate objects when restored.
"${DOCKER[@]}" exec "$CONTAINER" pg_dump -U outline -d outline --clean --if-exists | gzip -9 > "$TMP"
gzip -t "$TMP"

SIZE="$(stat -c %s "$TMP")"
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  echo "ERROR: dump is only ${SIZE} bytes (minimum ${MIN_BYTES}); not keeping it" >&2
  exit 1
fi
mv "$TMP" "$OUT"
chmod 600 "$OUT"
echo "OK local: $OUT (${SIZE} bytes)"

if [ "$LOCAL_ONLY" = 0 ]; then
  DEST="gs://${BUCKET}/postgres/${NAME}"
  if gcloud storage --help >/dev/null 2>&1; then
    gcloud storage cp --quiet "$OUT" "$DEST"
  else
    gsutil -q cp "$OUT" "$DEST"
  fi
  echo "OK uploaded: $DEST"
fi

# Keep KEEP_DAYS days of local dumps.
find "$LOCAL_DIR" -maxdepth 1 -name 'outline-*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete
