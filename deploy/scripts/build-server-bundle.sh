#!/usr/bin/env bash
# Builds the server bundle each release carries (D104): the server and the shared package with
# their production dependencies already installed, laid out like the repository, so it extracts
# straight into /opt/newcord and runs with Node.js alone. Native modules are installed for the
# platform this runs on, so releases build it on Linux Arm, like the Oracle machine.
#
#   deploy/scripts/build-server-bundle.sh <version> <output folder>
set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "Build the server bundle on Linux: its native modules must match the machine" >&2
  exit 1
fi

version="$1"
out="$2"
platform="$(node -p 'process.platform + "-" + process.arch')"
name="newcord-server-${version}-${platform}"

# A checkout that had a full install gets purged to production dependencies without asking.
pnpm install --frozen-lockfile --prod --filter "server..." --config.confirmModulesPurge=false

# The bundle must work wherever it is extracted, so any absolute link to a workspace package is
# made relative.
while IFS= read -r link; do
  target="$(readlink -f "$link")"
  ln -sfn "$(realpath --relative-to="$(dirname "$link")" "$target")" "$link"
done < <(find node_modules apps/server packages/shared -type l -lname '/*')

mkdir -p "$out"
tar -czf "$out/$name.tar.gz" \
  --exclude="apps/server/test" --exclude="*.db" --exclude=".env" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml apps/server packages/shared node_modules
echo "$out/$name.tar.gz"
