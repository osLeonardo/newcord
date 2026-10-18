#!/usr/bin/env bash
# Checks a server bundle the way the machine runs it (D104): extracts it into an empty folder,
# starts the server there with throwaway settings, and waits for GET /health to answer.
#
#   deploy/scripts/check-server-bundle.sh <bundle.tar.gz>
set -euo pipefail

bundle="$(realpath "$1")"
# An answer from another server would pass the check falsely.
if curl -fsS http://127.0.0.1:3000/health > /dev/null 2>&1; then
  echo "Something already answers on port 3000; stop it first" >&2
  exit 1
fi
dir="$(mktemp -d)"
server=""
trap 'if [ -n "$server" ]; then kill "$server" 2>/dev/null || true; fi; rm -rf "$dir"' EXIT

tar -xzf "$bundle" -C "$dir"
cd "$dir/apps/server"
secret() { node -p 'require("node:crypto").randomBytes(48).toString("base64")'; }
JWT_SECRET="$(secret)" RELAY_SECRET="$(secret)" \
  RELAY_URLS="stun:127.0.0.1:3478,turn:127.0.0.1:3478" \
  DATABASE_PATH="$dir/newcord.db" LISTEN_HOST=127.0.0.1 \
  node --import tsx src/index.ts &
server=$!

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health; then
    echo
    echo "The bundled server answered /health"
    exit 0
  fi
  sleep 1
done
echo "The bundled server did not answer /health within 30 seconds" >&2
exit 1
