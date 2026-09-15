#!/usr/bin/env bash
# upgrade.sh: upgrade Outline on this VM, with a database dump first.
#
# Usage (on the VM):
#   bash /opt/outline/upgrade.sh 1.11.0     # switch the pinned image tag, then upgrade
#   bash /opt/outline/upgrade.sh            # re-pull the current tag (patch rebuilds) and migrate
#
# Steps: local pg dump -> pull image -> stop outline -> run migrations -> start outline -> wait healthy.
# Read the release notes first: https://github.com/outline/outline/releases
#
# The Outline image has no yarn, so migrations run through the sequelize CLI directly, with the
# "production-ssl-disabled" config (the postgres container has no TLS on the private network).
# Outline also migrates on boot; running it here first makes a failing migration visible before
# the new version starts serving.
#
# Rollback: restore docker-compose.yml.bak.<stamp>, restore the dump printed below
# (see docs/steps/11-backups.md "Restore into production"), then docker compose up -d.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/outline}"
NEW_TAG="${1:-}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

cd "$INSTALL_DIR" || die "$INSTALL_DIR not found"
[ -f docker-compose.yml ] || die "no docker-compose.yml in $INSTALL_DIR"
if docker info >/dev/null 2>&1; then DOCKER=(docker); else DOCKER=(sudo docker); fi
compose() { "${DOCKER[@]}" compose --project-directory "$INSTALL_DIR" -f "$INSTALL_DIR/docker-compose.yml" "$@"; }

current="$(sed -nE 's/^[[:space:]]*image:[[:space:]]*outlinewiki\/outline:([^[:space:]]+).*/\1/p' docker-compose.yml | head -n 1)"
[ -n "$current" ] || die "could not find the outlinewiki/outline image line in docker-compose.yml"
log "Current Outline image tag: $current"

if [ -n "$NEW_TAG" ] && [ "$NEW_TAG" != "$current" ]; then
  [[ "$NEW_TAG" =~ ^[A-Za-z0-9._-]+$ ]] || die "invalid tag: $NEW_TAG"
  stamp="$(date -u +%Y%m%d%H%M%S)"
  cp -p docker-compose.yml "docker-compose.yml.bak.$stamp"
  sed -i -E "s#^([[:space:]]*image:[[:space:]]*outlinewiki/outline:)[^[:space:]]+#\1${NEW_TAG}#" docker-compose.yml
  log "Image tag set to $NEW_TAG (previous file: docker-compose.yml.bak.$stamp)"
fi

log "1/5 Database dump before upgrading"
sudo bash "$INSTALL_DIR/pg-backup.sh" --local-only

log "2/5 Pulling the image"
compose pull outline

log "3/5 Stopping outline (postgres and redis keep running)"
compose stop outline

log "4/5 Running database migrations"
compose run --rm --entrypoint sh outline \
  -c "node_modules/.bin/sequelize db:migrate --env=production-ssl-disabled"

log "5/5 Starting outline"
compose up -d outline

log "Waiting for the container to report healthy (up to 5 minutes)"
for _ in $(seq 1 30); do
  status="$("${DOCKER[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' outline 2>/dev/null || echo missing)"
  [ "$status" = "healthy" ] && break
  printf '.'; sleep 10
done
echo
[ "$status" = "healthy" ] || { compose logs --tail=60 outline; die "outline is '$status' after 5 minutes"; }

compose ps
log "Upgrade finished: $(sed -nE 's/^[[:space:]]*image:[[:space:]]*(outlinewiki\/outline:[^[:space:]]+).*/\1/p' docker-compose.yml | head -n 1)"
