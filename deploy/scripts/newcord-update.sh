#!/usr/bin/env bash
# Installs a released server version and switches the backend to it (D105). It downloads
# newcord-server-<version>-linux-arm64.tar.gz and the release's SHA256SUMS from GitHub, checks
# the bundle against them, extracts it beside the earlier versions, copies the database, points
# /opt/newcord at the new version and restarts the backend. If the backend does not answer
# /health within 30 seconds, it puts back the previous version and the database copy, and fails.
# The 3 newest versions and database copies are kept.
#
# Install as /usr/local/bin/newcord-update (root, chmod 755), then:
#   sudo newcord-update 0.1.1
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: newcord-update <version>, for example 0.1.1" >&2
  exit 2
fi

# Overridden only by the tests. sudo resets the environment, so the deploy user cannot.
releases_url="${NEWCORD_RELEASES_URL:-https://github.com/osLeonardo/newcord/releases/download}"
releases_dir="${NEWCORD_RELEASES_DIR:-/opt/newcord-releases}"
current="${NEWCORD_CURRENT:-/opt/newcord}"
database="${NEWCORD_DATABASE:-/var/lib/newcord/newcord.db}"
backup_dir="${NEWCORD_BACKUP_DIR:-/var/backups/newcord}"
health_url="${NEWCORD_HEALTH_URL:-http://127.0.0.1:3000/health}"
keep=3

start_backend() {
  if [ -n "${NEWCORD_RESTART:-}" ]; then bash -c "$NEWCORD_RESTART"; else systemctl restart newcord-backend; fi
}
stop_backend() {
  if [ -n "${NEWCORD_STOP:-}" ]; then bash -c "$NEWCORD_STOP"; else systemctl stop newcord-backend; fi
}
healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS "$health_url" > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}
switch_to() {
  ln -sfn "$1" "$current.next"
  mv -T "$current.next" "$current"
}

if [ -e "$current" ] && [ ! -L "$current" ]; then
  echo "$current is a folder, not a link to a version; move it into $releases_dir first" >&2
  exit 1
fi
previous="$(readlink -f "$current" 2> /dev/null || true)"
target="$releases_dir/$version"
name="newcord-server-${version}-linux-arm64.tar.gz"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Downloading $name"
curl -fsSL -o "$work/$name" "$releases_url/v$version/$name"
curl -fsSL -o "$work/SHA256SUMS" "$releases_url/v$version/SHA256SUMS"
if ! grep -q "[ *]$name\$" "$work/SHA256SUMS"; then
  echo "The release's SHA256SUMS does not list $name" >&2
  exit 1
fi
(cd "$work" && grep "[ *]$name\$" SHA256SUMS | sha256sum -c --quiet -)

if [ ! -d "$target" ]; then
  mkdir -p "$releases_dir"
  partial="$releases_dir/.$version.partial"
  rm -rf "$partial"
  mkdir "$partial"
  tar --no-same-owner -xzf "$work/$name" -C "$partial"
  mv "$partial" "$target"
fi

database_copy=""
if [ -f "$database" ]; then
  mkdir -p "$backup_dir"
  database_copy="$backup_dir/pre-deploy-$version-$(date +%Y%m%dT%H%M%S).db"
  sqlite3 "$database" ".backup '$database_copy'"
fi

# Older versions and database copies go, beyond the newest few and the one before this. Finding
# none to remove is fine: tidying up never fails an update that worked.
prune() {
  local old
  for old in $(ls -1dt "$releases_dir"/*/ 2> /dev/null | tail -n +$((keep + 1))); do
    old="${old%/}"
    if [ "$old" != "$target" ] && [ "$old" != "$previous" ]; then rm -rf "$old"; fi
  done
  ls -1t "$backup_dir"/pre-deploy-*.db 2> /dev/null | tail -n +$((keep + 1)) | xargs -r rm -f || true
}

switch_to "$target"
start_backend
if healthy; then
  echo "newcord server $version is live"
  prune
  exit 0
fi

echo "newcord server $version did not answer $health_url within 30 seconds" >&2
if [ -n "$previous" ] && [ "$previous" != "$target" ]; then
  echo "Going back to $(basename "$previous")" >&2
  stop_backend
  if [ -n "$database_copy" ]; then sqlite3 "$database" ".restore '$database_copy'"; fi
  switch_to "$previous"
  start_backend
  if healthy; then
    echo "$(basename "$previous") is live again" >&2
  else
    echo "$(basename "$previous") does not answer either; check journalctl -u newcord-backend" >&2
  fi
fi
exit 1
