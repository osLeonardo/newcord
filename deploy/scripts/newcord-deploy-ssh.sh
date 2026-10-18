#!/usr/bin/env bash
# The only thing the deploy key may do (D105): authorized_keys forces this command, which reads
# the version GitHub asked for from SSH_ORIGINAL_COMMAND and runs newcord-update through sudo.
#
# Install as /usr/local/bin/newcord-deploy-ssh (root, chmod 755). The deploy user's
# ~/.ssh/authorized_keys holds the key as:
#   restrict,command="/usr/local/bin/newcord-deploy-ssh" ssh-ed25519 AAAA… github-deploy
set -euo pipefail

version="${SSH_ORIGINAL_COMMAND:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Send only a version, for example 0.1.1" >&2
  exit 2
fi
exec sudo -n /usr/local/bin/newcord-update "$version"
