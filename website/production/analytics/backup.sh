#!/usr/bin/env bash
set -euo pipefail
umask 077

exec 9>/var/lock/ks-plausible-backup.lock
flock -n 9 || exit 0
cd /opt/plausible-ce
compose=(docker compose -p ks-plausible)
backup_root=/var/backups/ks-plausible
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot="$backup_root/$stamp"
mkdir -p "$snapshot"

"${compose[@]}" exec -T plausible_db pg_dump -U postgres -Fc plausible_db > "$snapshot/postgres.dump"
"${compose[@]}" exec -T plausible_events_db clickhouse-client --query \
  "BACKUP DATABASE plausible_events_db TO Disk('backups', '$stamp')"
"${compose[@]}" cp "plausible_events_db:/var/lib/clickhouse/backups/$stamp" "$snapshot/clickhouse"
cp .env compose.yml compose.override.yml backup.xml "$snapshot/"
tar -czf "$backup_root/$stamp.tar.gz" -C "$backup_root" "$stamp"
rm -rf -- "$snapshot"
"${compose[@]}" exec -T plausible_events_db rm -rf -- "/var/lib/clickhouse/backups/$stamp"
find "$backup_root" -maxdepth 1 -name '*.tar.gz' -mtime +13 -delete
echo "Plausible backup saved: $backup_root/$stamp.tar.gz"
