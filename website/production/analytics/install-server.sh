#!/usr/bin/env bash
# Run as root on cz after copying this directory to a private staging path.
set -euo pipefail

source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
destination=/opt/plausible-ce
test -f "$destination/compose.yml"
install -m 0644 "$source_dir/compose.override.yml" "$source_dir/backup.xml" "$destination/"
if [[ ! -f "$destination/.env" ]]; then
  umask 077
  {
    printf 'BASE_URL=https://stats.ks-design.art\n'
    printf 'SECRET_KEY_BASE=%s\n' "$(openssl rand -base64 48)"
  } > "$destination/.env"
fi
chmod 0600 "$destination/.env"

cd "$destination"
docker compose -p ks-plausible up -d --wait --wait-timeout 180

site=/etc/nginx/sites-available/stats.ks-design.art.conf
if [[ ! -f /etc/letsencrypt/live/stats.ks-design.art/fullchain.pem ]]; then
  install -m 0644 "$source_dir/stats-http.conf" "$site"
  ln -sfn "$site" /etc/nginx/sites-enabled/stats.ks-design.art.conf
  nginx -t
  systemctl reload nginx
  certbot certonly --webroot --webroot-path /var/www/certbot \
    --cert-name stats.ks-design.art --domains stats.ks-design.art \
    --non-interactive --agree-tos --keep-until-expiring
fi
install -m 0644 "$source_dir/stats.conf" "$site"
ln -sfn "$site" /etc/nginx/sites-enabled/stats.ks-design.art.conf
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --retry 6 --retry-all-errors --retry-delay 1 \
  --resolve stats.ks-design.art:443:127.0.0.1 https://stats.ks-design.art/api/health

install -d -m 0700 /var/backups/ks-plausible
install -m 0750 "$source_dir/backup.sh" /usr/local/sbin/ks-plausible-backup
install -m 0644 "$source_dir/ks-plausible-backup.service" "$source_dir/ks-plausible-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ks-plausible-backup.timer
systemctl start ks-plausible-backup.service
