#!/usr/bin/env bash
# install.sh: install (or re-run) the Outline stack on this VM. Safe to run again at any time.
#
# Run ON the VM as your normal ssh user (sudo is used where needed), from an interactive terminal,
# because it asks for two secrets without echo:
#
#   bash ~/outline-kit/install.sh \
#     --host wiki.example.com \
#     --uploads-bucket kna-wiki-a1b2-uploads --backups-bucket kna-wiki-a1b2-backups \
#     --google-client-id 123456789012-abc.apps.googleusercontent.com \
#     --hmac-access-id <access id printed by `gcloud storage hmac create`> \
#     --region asia-northeast3 --language en_US
#
# From your laptop: gcloud compute ssh <vm> --zone <zone> -- -t 'bash ~/outline-kit/install.sh ...'
# (-t gives the remote script a terminal so the hidden prompts work).
#
# Every option can also come from the environment: WIKI_HOST, UPLOADS_BUCKET, BACKUP_BUCKET,
# GOOGLE_CLIENT_ID, HMAC_ACCESS_ID, AWS_REGION, DEFAULT_LANGUAGE.
#
# What it does:
#   1. creates /opt/outline and copies docker-compose.yml, Caddyfile and the helper scripts into it
#   2. creates /opt/outline/.env from .env.example (mode 600) if missing
#   3. generates SECRET_KEY, UTILS_SECRET, POSTGRES_PASSWORD once (never overwrites them)
#   4. fills URL, DATABASE_URL, REDIS_URL, WIKI_HOST, buckets, HMAC access id, Google client id
#   5. prompts (hidden) for GOOGLE_CLIENT_SECRET and the HMAC secret if they are not set yet
#   6. docker compose pull && up -d, then waits until https://<host>/_health answers OK
#
# Personal Gmail accounts (no Google Workspace): Outline refuses to create a new workspace from a
# personal Gmail sign-in. Use --personal-gmail on the first run: Google sign-in stays switched off,
# so the first visit shows Outline's "Create workspace" form. After you created the workspace
# there, run this script again with --enable-google. See deploy/outline/README.md.
set -euo pipefail

usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
  cat <<'EOF'
Options:
  --host HOST                 public hostname, e.g. wiki.example.com
  --uploads-bucket NAME       GCS bucket for attachments (no gs:// prefix)
  --backups-bucket NAME       GCS bucket for database dumps (no gs:// prefix)
  --google-client-id ID       Google OAuth web client id (*.apps.googleusercontent.com)
  --hmac-access-id ID         access id of the outline-storage HMAC key
  --region REGION             any string for AWS_REGION; default: keep existing
  --language CODE             DEFAULT_LANGUAGE, e.g. en_US or ko_KR
  --personal-gmail            first run for a personal Gmail admin: keep Google sign-in off for now
  --enable-google             second run after --personal-gmail: switch Google sign-in on
  --wait SECONDS              how long to wait for HTTPS (default 600)
  -h, --help                  this help
EOF
}

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/opt/outline}"
ENV_FILE="$INSTALL_DIR/.env"

HOST="${WIKI_HOST:-}"
UPLOADS_BUCKET="${UPLOADS_BUCKET:-}"
BACKUPS_BUCKET="${BACKUP_BUCKET:-}"
GCLIENT_ID="${GOOGLE_CLIENT_ID:-}"
HMAC_ID="${HMAC_ACCESS_ID:-}"
REGION="${AWS_REGION:-}"
LANGUAGE="${DEFAULT_LANGUAGE:-}"
PERSONAL_GMAIL=0
ENABLE_GOOGLE=0
WAIT_SECONDS=600

need_arg() { [ $# -ge 2 ] && [ -n "$2" ] || die "option $1 needs a value"; }
while [ $# -gt 0 ]; do
  case "$1" in
    --host)             need_arg "$@"; HOST="$2"; shift 2 ;;
    --uploads-bucket)   need_arg "$@"; UPLOADS_BUCKET="$2"; shift 2 ;;
    --backups-bucket)   need_arg "$@"; BACKUPS_BUCKET="$2"; shift 2 ;;
    --google-client-id) need_arg "$@"; GCLIENT_ID="$2"; shift 2 ;;
    --hmac-access-id)   need_arg "$@"; HMAC_ID="$2"; shift 2 ;;
    --region)           need_arg "$@"; REGION="$2"; shift 2 ;;
    --language)         need_arg "$@"; LANGUAGE="$2"; shift 2 ;;
    --personal-gmail)   PERSONAL_GMAIL=1; shift ;;
    --enable-google)    ENABLE_GOOGLE=1; shift ;;
    --wait)             need_arg "$@"; WAIT_SECONDS="$2"; shift 2 ;;
    -h|--help)          usage; exit 0 ;;
    *)                  die "unknown option: $1 (see --help)" ;;
  esac
done
[ "$PERSONAL_GMAIL" = 1 ] && [ "$ENABLE_GOOGLE" = 1 ] && die "use --personal-gmail and --enable-google in separate runs"

# Normalize inputs: strip scheme, trailing slash and gs:// prefixes.
HOST="${HOST#https://}"; HOST="${HOST#http://}"; HOST="${HOST%%/*}"
UPLOADS_BUCKET="${UPLOADS_BUCKET#gs://}"; UPLOADS_BUCKET="${UPLOADS_BUCKET%/}"
BACKUPS_BUCKET="${BACKUPS_BUCKET#gs://}"; BACKUPS_BUCKET="${BACKUPS_BUCKET%/}"

# ---- .env helpers ----------------------------------------------------------------------------
env_get() {  # prints the value of KEY, or nothing
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true
}
env_set() {  # replaces KEY=... in place (keeps mode 600), or appends it
  local tmp
  tmp="$(mktemp "$INSTALL_DIR/.env.tmp.XXXXXX")"
  KEY="$1" VAL="$2" awk '
    BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"]; done = 0 }
    index($0, k "=") == 1 { if (!done) { print k "=" v; done = 1 } ; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}
env_del() {
  local tmp
  tmp="$(mktemp "$INSTALL_DIR/.env.tmp.XXXXXX")"
  KEY="$1" awk 'index($0, ENVIRON["KEY"] "=") != 1 { print }' "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}
unset_or_placeholder() { local v; v="$(env_get "$1")"; [ -z "$v" ] || [[ "$v" == *CHANGE_ME* ]]; }
last4() { local v="$1"; printf '%s' "${v: -4}"; }
# Sets KEY from an explicit value if given; otherwise keeps the current value; dies if still unset.
set_config() {
  local key="$1" val="$2" flag="$3"
  if [ -n "$val" ]; then
    env_set "$key" "$val"
  elif unset_or_placeholder "$key"; then
    die "$key is not set yet: pass $flag"
  fi
}
prompt_secret() {  # prompt_secret KEY "label" -> stores into KEY without echo
  local key="$1" label="$2" a b
  [ -t 0 ] || die "$key must be entered interactively. Run through: gcloud compute ssh <vm> -- -t '...'"
  while :; do
    read -r -s -p "$label (input hidden): " a; echo
    [ -n "$a" ] || { warn "empty, try again"; continue; }
    read -r -s -p "Paste it again to confirm: " b; echo
    [ "$a" = "$b" ] && break
    warn "the two entries differ, try again"
  done
  [[ "$a" =~ [[:space:]] ]] && die "$key contains whitespace; paste only the value"
  env_set "$key" "$a"
  log "$key saved to $ENV_FILE (ends with ...$(last4 "$a"))"
}

# ---- docker ----------------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "docker is not installed. Step 03 (kna-03-vm) installs it."
if docker info >/dev/null 2>&1; then DOCKER=(docker); else DOCKER=(sudo docker); fi
"${DOCKER[@]}" compose version >/dev/null 2>&1 \
  || die "docker compose plugin missing: sudo apt-get install -y docker-compose-plugin"
compose() { "${DOCKER[@]}" compose --project-directory "$INSTALL_DIR" -f "$INSTALL_DIR/docker-compose.yml" "$@"; }
command -v openssl >/dev/null 2>&1 || die "openssl missing: sudo apt-get install -y openssl"
command -v curl >/dev/null 2>&1 || die "curl missing: sudo apt-get install -y curl"

if [ -z "$(swapon --show 2>/dev/null || true)" ]; then
  warn "no swap on this VM. Outline + postgres on 4 GB RAM can run out of memory during upgrades."
  warn "step 03 adds 2 GB swap with vm.swappiness=10; see deploy/outline/README.md."
fi

# ---- 1. files --------------------------------------------------------------------------------
log "Preparing $INSTALL_DIR"
sudo install -d -m 750 -o "$(id -un)" -g "$(id -gn)" "$INSTALL_DIR"
if [ "$KIT_DIR" != "$INSTALL_DIR" ]; then
  stamp="$(date -u +%Y%m%d%H%M%S)"
  for f in docker-compose.yml Caddyfile .env.example install.sh upgrade.sh pg-backup.sh \
           lifecycle-30d.json cors.json README.md; do
    [ -f "$KIT_DIR/$f" ] || continue
    if [ -f "$INSTALL_DIR/$f" ] && ! cmp -s "$KIT_DIR/$f" "$INSTALL_DIR/$f"; then
      cp -p "$INSTALL_DIR/$f" "$INSTALL_DIR/$f.bak.$stamp"
      warn "$f changed; previous copy kept as $f.bak.$stamp"
    fi
    case "$f" in *.sh) mode=755 ;; *) mode=644 ;; esac
    install -m "$mode" "$KIT_DIR/$f" "$INSTALL_DIR/$f"
  done
fi
[ -f "$INSTALL_DIR/docker-compose.yml" ] || die "docker-compose.yml not found next to install.sh"

if [ -f "$ENV_FILE" ] && { [ ! -r "$ENV_FILE" ] || [ ! -w "$ENV_FILE" ]; }; then
  die "$ENV_FILE is not readable/writable by $(id -un). Fix: sudo chown $(id -un): $ENV_FILE && sudo chmod 600 $ENV_FILE"
fi
if [ ! -f "$ENV_FILE" ]; then
  (umask 077 && cp "$INSTALL_DIR/.env.example" "$ENV_FILE")
  log "Created $ENV_FILE from .env.example"
fi
chmod 600 "$ENV_FILE"

# ---- 2. generated secrets (only once) --------------------------------------------------------
if unset_or_placeholder SECRET_KEY;   then env_set SECRET_KEY "$(openssl rand -hex 32)";   log "Generated SECRET_KEY"; fi
if unset_or_placeholder UTILS_SECRET; then env_set UTILS_SECRET "$(openssl rand -hex 32)"; log "Generated UTILS_SECRET"; fi
if unset_or_placeholder POSTGRES_PASSWORD; then
  if "${DOCKER[@]}" volume inspect outline_pgdata >/dev/null 2>&1; then
    die "POSTGRES_PASSWORD is missing from .env but the database volume outline_pgdata already exists.
A new password would not match the existing database. Restore the old .env, or (only on an empty test
install) remove the stack and its data: cd $INSTALL_DIR && ${DOCKER[*]} compose down -v"
  fi
  # base64 uses + and /, which break a postgres:// URL; switch to the URL-safe alphabet.
  env_set POSTGRES_PASSWORD "$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=\n')"
  log "Generated POSTGRES_PASSWORD"
fi
env_set DATABASE_URL "postgres://outline:$(env_get POSTGRES_PASSWORD)@postgres:5432/outline"
env_set REDIS_URL "redis://redis:6379"

# ---- 3. configuration ------------------------------------------------------------------------
[ -n "$HOST" ] || HOST="$(env_get WIKI_HOST)"
[ -n "$HOST" ] && [ "$HOST" != "wiki.example.com" ] || die "pass --host (the wiki hostname from step 04)"
env_set WIKI_HOST "$HOST"
env_set URL "https://$HOST"
set_config AWS_S3_UPLOAD_BUCKET_NAME "$UPLOADS_BUCKET" --uploads-bucket
set_config BACKUP_BUCKET "$BACKUPS_BUCKET" --backups-bucket
[ -n "$REGION" ] && env_set AWS_REGION "$REGION"
[ -n "$LANGUAGE" ] && env_set DEFAULT_LANGUAGE "$LANGUAGE"
for fixed in "FORCE_HTTPS=false" "AWS_S3_FORCE_PATH_STYLE=true" "AWS_S3_UPLOAD_BUCKET_URL=https://storage.googleapis.com" \
             "FILE_STORAGE=s3" "PGSSLMODE=disable"; do
  env_set "${fixed%%=*}" "${fixed#*=}"
done

# HMAC key for GCS (step 06 creates it). The access id is not secret; the secret is prompted for.
if [ -n "$HMAC_ID" ]; then
  env_set AWS_ACCESS_KEY_ID "$HMAC_ID"
elif unset_or_placeholder AWS_ACCESS_KEY_ID; then
  [ -t 0 ] || die "pass --hmac-access-id"
  read -r -p "HMAC access id (starts with GOOG): " HMAC_ID
  [ -n "$HMAC_ID" ] || die "HMAC access id is required"
  env_set AWS_ACCESS_KEY_ID "$HMAC_ID"
fi
if unset_or_placeholder AWS_SECRET_ACCESS_KEY; then
  prompt_secret AWS_SECRET_ACCESS_KEY "HMAC secret for $(env_get AWS_ACCESS_KEY_ID)"
  s="$(env_get AWS_SECRET_ACCESS_KEY)"
  [ "${#s}" -eq 40 ] || warn "GCS HMAC secrets are 40 characters; this one has ${#s}. Re-run after fixing .env if uploads fail."
fi

# Google OAuth. In personal-Gmail mode the values wait under KNA_DEFERRED_* until --enable-google.
[ -n "$(env_get KNA_DEFERRED_GOOGLE_CLIENT_SECRET)" ] && [ "$ENABLE_GOOGLE" = 0 ] && PERSONAL_GMAIL=1
if [ "$ENABLE_GOOGLE" = 1 ]; then
  id="$(env_get KNA_DEFERRED_GOOGLE_CLIENT_ID)"; sec="$(env_get KNA_DEFERRED_GOOGLE_CLIENT_SECRET)"
  if [ -n "$sec" ]; then
    env_set GOOGLE_CLIENT_ID "${GCLIENT_ID:-$id}"
    env_set GOOGLE_CLIENT_SECRET "$sec"
    env_del KNA_DEFERRED_GOOGLE_CLIENT_ID
    env_del KNA_DEFERRED_GOOGLE_CLIENT_SECRET
    log "Google sign-in switched on"
  elif unset_or_placeholder GOOGLE_CLIENT_SECRET; then
    die "nothing to enable: no deferred Google credentials in .env. Run without --enable-google."
  fi
  unset sec
elif [ "$PERSONAL_GMAIL" = 1 ]; then
  if ! unset_or_placeholder GOOGLE_CLIENT_SECRET; then
    warn "Google sign-in is already configured; --personal-gmail ignored"
    PERSONAL_GMAIL=0
  else
    [ -n "$GCLIENT_ID" ] || GCLIENT_ID="$(env_get KNA_DEFERRED_GOOGLE_CLIENT_ID)"
    [ -n "$GCLIENT_ID" ] || die "pass --google-client-id"
    env_set KNA_DEFERRED_GOOGLE_CLIENT_ID "$GCLIENT_ID"
    unset_or_placeholder KNA_DEFERRED_GOOGLE_CLIENT_SECRET \
      && prompt_secret KNA_DEFERRED_GOOGLE_CLIENT_SECRET "Google OAuth client secret"
    env_del GOOGLE_CLIENT_ID
    env_del GOOGLE_CLIENT_SECRET
    log "Personal Gmail mode: Google sign-in stays off until you run --enable-google"
  fi
fi
if [ "$ENABLE_GOOGLE" = 0 ] && [ "$PERSONAL_GMAIL" = 0 ]; then
  if [ -n "$GCLIENT_ID" ]; then
    env_set GOOGLE_CLIENT_ID "$GCLIENT_ID"
  elif unset_or_placeholder GOOGLE_CLIENT_ID; then
    die "pass --google-client-id (from step 05)"
  fi
  [[ "$(env_get GOOGLE_CLIENT_ID)" == *.apps.googleusercontent.com ]] \
    || warn "GOOGLE_CLIENT_ID does not end with .apps.googleusercontent.com"
  unset_or_placeholder GOOGLE_CLIENT_SECRET && prompt_secret GOOGLE_CLIENT_SECRET "Google OAuth client secret"
fi
chmod 600 "$ENV_FILE"

# Nothing left as a placeholder?
left="$(grep -E '^[A-Z_]+=.*CHANGE_ME' "$ENV_FILE" | cut -d= -f1 | tr '\n' ' ' || true)"
[ -z "$left" ] || die "still placeholders in .env: $left"

# ---- 4. start --------------------------------------------------------------------------------
log "Validating compose file"
compose config -q
log "Pulling images (first time: a few minutes)"
compose pull
log "Starting containers"
if [ "$ENABLE_GOOGLE" = 1 ]; then
  compose up -d --force-recreate outline
fi
compose up -d

# ---- 5. wait for HTTPS -----------------------------------------------------------------------
log "Waiting for https://$HOST/_health (Caddy gets a certificate, Outline runs migrations)"
deadline=$(( $(date +%s) + WAIT_SECONDS ))
until body="$(curl -fsS --max-time 10 "https://$HOST/_health" 2>/dev/null)" && [ "$body" = "OK" ]; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo
    warn "no healthy HTTPS answer after ${WAIT_SECONDS}s. Diagnostics:"
    compose ps || true
    compose logs --tail=40 caddy outline || true
    cat >&2 <<EOF

Likely causes:
  - DNS for $HOST does not point at this VM yet (check: dig +short $HOST)
  - firewall does not allow tcp:80 and tcp:443 (Let's Encrypt needs port 80 or 443 from the internet)
  - Outline is still migrating on first boot (watch: ${DOCKER[*]} compose -f $INSTALL_DIR/docker-compose.yml logs -f outline)
Re-running this script is safe.
EOF
    exit 1
  fi
  printf '.'; sleep 10
done
echo
log "https://$HOST is up"
compose ps

# ---- 6. next steps ---------------------------------------------------------------------------
if [ "$PERSONAL_GMAIL" = 1 ]; then
  cat <<EOF

Next (personal Gmail):
  1. Open https://$HOST now. You see "Create workspace". Enter a workspace name, your name and
     your Gmail address exactly as you will sign in with Google. You are now the admin.
  2. Back here, run:  bash $INSTALL_DIR/install.sh --enable-google
EOF
elif [ "$ENABLE_GOOGLE" = 1 ]; then
  cat <<EOF

Next (still signed in from the "Create workspace" form):
  1. https://$HOST/settings/authentication -> Google -> Connect, and finish the Google sign-in.
  2. https://$HOST/settings/security -> turn on "Require invites". Without it, any Gmail user
     who finds your wiki can create an account in it.
  3. Sign out and sign in again with "Continue with Google" to confirm it works.
EOF
else
  cat <<EOF

Next:
  1. Open https://$HOST and choose "Continue with Google". The first account becomes the admin.
  2. https://$HOST/settings/details -> set the workspace name.
  3. https://$HOST/settings/security -> turn on "Require invites" (or set "Allowed domains" to your
     domain). With neither, accounts from any Google Workspace domain can sign up.
EOF
fi
