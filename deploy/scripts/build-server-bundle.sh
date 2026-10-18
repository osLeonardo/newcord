#!/usr/bin/env bash
# Builds the server bundle each release carries (D104): the server and the shared package with
# their production dependencies already installed, laid out like the repository, so it runs from
# /opt/newcord with Node.js alone, plus the deployment files for the same version (deploy/).
# Native modules are installed for the platform this runs on, so releases build it on Linux Arm,
# like the Oracle machine.
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

# The repository's hoisted layout, which electron-builder needs, would install every workspace
# project's dependencies whatever the filter; the isolated one installs the server's alone. A
# checkout that had a full install gets purged without asking.
pnpm install --frozen-lockfile --prod --filter "server..." \
  --config.node-linker=isolated --config.confirmModulesPurge=false

# The bundle must work wherever it is extracted, so any absolute link to a workspace package is
# made relative.
while IFS= read -r link; do
  target="$(readlink -f "$link")"
  ln -sfn "$(realpath --relative-to="$(dirname "$link")" "$target")" "$link"
done < <(find node_modules apps/server packages/shared -type l -lname '/*')

mkdir -p "$out"
tar -czf "$out/$name.tar.gz" \
  --exclude="apps/server/test" --exclude="*.db" --exclude=".env" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml apps/server packages/shared node_modules deploy
echo "$out/$name.tar.gz"
