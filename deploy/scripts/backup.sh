#!/usr/bin/env bash
# Nightly backup of the backend's SQLite file (14-server-deployment step 10): a safe
# copy while the database is in use, uploaded to a private Oracle Object Storage
# bucket, keeping 7 days of copies there and on the machine.
set -euo pipefail

DATABASE="${NEWCORD_DATABASE:-/var/lib/newcord/newcord.db}"
BACKUP_DIR="${NEWCORD_BACKUP_DIR:-/var/backups/newcord}"
BUCKET="${NEWCORD_BACKUP_BUCKET:?set NEWCORD_BACKUP_BUCKET in /etc/newcord/backup.env}"

today="$(date +%F)"
expired="$(date -d '7 days ago' +%F)"
copy="$BACKUP_DIR/newcord-$today.db"

mkdir -p "$BACKUP_DIR"
sqlite3 "$DATABASE" ".backup '$copy'"
oci os object put --bucket-name "$BUCKET" --file "$copy" \
  --name "newcord-$today.db" --force

# The copy from 7 days ago leaves the bucket; a missing one is not an error.
oci os object delete --bucket-name "$BUCKET" \
  --object-name "newcord-$expired.db" --force || true
find "$BACKUP_DIR" -name 'newcord-*.db' -mtime +6 -delete
