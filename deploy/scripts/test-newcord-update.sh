#!/usr/bin/env bash
# Tests newcord-update against a real server bundle in a scratch folder (D105): a first install,
# an update, a broken version that must roll back to the one before with its database copy, a
# bundle whose checksum does not match, a bad version, and a machine whose processor no bundle is
# built for. Runs on Linux Arm or x86_64, without root.
#
#   deploy/scripts/test-newcord-update.sh <newcord-server-*-linux-<arch>.tar.gz>
set -euo pipefail

bundle="$(realpath "$1")"
update="$(cd "$(dirname "$0")" && pwd)/newcord-update.sh"
root="$(mktemp -d)"
# Named as build-server-bundle.sh names it on this machine, so newcord-update must pick the same.
platform="$(node -p 'process.platform + "-" + process.arch')"
trap 'bash "$root/stop.sh" 2> /dev/null || true; rm -rf "$root"' EXIT

# A download site on disk, laid out like GitHub's: v<version>/<bundle> and SHA256SUMS.
release() {
  local version="$1" source="$2" folder="$root/site/v$1"
  mkdir -p "$folder"
  cp "$source" "$folder/newcord-server-$version-$platform.tar.gz"
  (cd "$folder" && sha256sum -- *.tar.gz > SHA256SUMS)
}

# The backend as systemd would run it, from whatever /opt/newcord points at.
secret() { node -p 'require("node:crypto").randomBytes(48).toString("base64")'; }
mkdir -p "$root/data"
cat > "$root/start.sh" << EOF
bash "$root/stop.sh"
cd "$root/current/apps/server"
JWT_SECRET='$(secret)' RELAY_SECRET='$(secret)' \
  RELAY_URLS=stun:127.0.0.1:3478,turn:127.0.0.1:3478 \
  DATABASE_PATH="$root/data/newcord.db" LISTEN_HOST=127.0.0.1 \
  nohup node --import tsx src/index.ts >> "$root/server.log" 2>&1 &
echo \$! > "$root/server.pid"
EOF
cat > "$root/stop.sh" << EOF
if [ -f "$root/server.pid" ]; then kill "\$(cat "$root/server.pid")" 2> /dev/null || true; rm -f "$root/server.pid"; sleep 1; fi
EOF

export NEWCORD_RELEASES_URL="file://$root/site"
export NEWCORD_RELEASES_DIR="$root/releases"
export NEWCORD_CURRENT="$root/current"
export NEWCORD_DATABASE="$root/data/newcord.db"
export NEWCORD_BACKUP_DIR="$root/backups"
export NEWCORD_RESTART="bash $root/start.sh"
export NEWCORD_STOP="bash $root/stop.sh"

fail() {
  echo "FAILED: $1" >&2
  tail -20 "$root/server.log" >&2 || true
  exit 1
}
live() { [ "$(basename "$(readlink -f "$root/current")")" = "$1" ]; }

# A broken version: its server exits at once.
broken="$root/broken"
mkdir -p "$broken"
tar -xzf "$bundle" -C "$broken"
echo 'process.exit(1);' > "$broken/apps/server/src/index.ts"
tar -czf "$root/broken.tar.gz" -C "$broken" .

release 0.0.1 "$bundle"
release 0.0.2 "$bundle"
release 0.0.3 "$root/broken.tar.gz"
release 0.0.4 "$bundle"
echo "0000000000000000000000000000000000000000000000000000000000000000  newcord-server-0.0.4-$platform.tar.gz" > "$root/site/v0.0.4/SHA256SUMS"

echo "== a first install"
bash "$update" 0.0.1 || fail "the first install did not succeed"
live 0.0.1 || fail "0.0.1 is not live"

echo "== an update"
bash "$update" 0.0.2 || fail "the update did not succeed"
live 0.0.2 || fail "0.0.2 is not live"
ls "$root/backups"/pre-deploy-0.0.2-*.db > /dev/null || fail "no database copy was made before the update"

echo "== a broken version rolls back"
if bash "$update" 0.0.3; then fail "a version that never answered /health was kept"; fi
live 0.0.2 || fail "the rollback did not put 0.0.2 back"
curl -fsS http://127.0.0.1:3000/health > /dev/null || fail "0.0.2 does not answer after the rollback"

echo "== a bundle that does not match its checksum"
if bash "$update" 0.0.4; then fail "a bundle with the wrong checksum was installed"; fi
live 0.0.2 || fail "a failed download changed the live version"
[ ! -d "$root/releases/0.0.4" ] || fail "a bundle with the wrong checksum was extracted"

echo "== a bad version"
status=0
bash "$update" "0.1; reboot" || status=$?
[ "$status" -eq 2 ] || fail "a bad version was not refused with status 2"

echo "== a machine no bundle is built for"
if NEWCORD_MACHINE=riscv64 bash "$update" 0.0.1; then fail "an update ran on a machine without a bundle"; fi
live 0.0.2 || fail "a machine without a bundle changed the live version"

echo "newcord-update passed every case"
