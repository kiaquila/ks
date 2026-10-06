# Plausible Community Edition

The production dashboard is https://stats.ks-design.art. The administrator
email is `krisredlips@gmail.com`. Passwords are set by the administrator in the
browser, never stored in this repository.

## Installation

The `cz` host runs the official Community Edition checkout at
`/opt/plausible-ce`, pinned to `v3.2.1`. Its Compose project is `ks-plausible`,
separate from both the portfolio and Capsule Zero. PostgreSQL and ClickHouse
are not exposed; the application binds only to `127.0.0.1:3200`.

Copy this directory to a private staging directory on `cz`, then run
`sudo bash <staging-directory>/install-server.sh`. The installer preserves
the existing secret and databases. It installs the HTTPS virtual host and
backup timer, and refuses to launch if the effective Compose image is not
the pinned security release. The release check uses the host's Python 3
standard JSON parser. Run `sudo bash <staging-directory>/check-release.sh`
from `/opt/plausible-ce` for a read-only check before installation.
A Cloudflare-proxied A record for `stats.ks-design.art` must
already point to this server. The ACME webroot and trusted Cloudflare real-IP
configuration are shared with the existing host setup.

After creating the first account, add `ks-design.art` as a site and custom
event goals named `Contact email`, `Contact telegram`, `Contact whatsapp`,
`Contact linkedin`, `Contact instagram`, and `Contact github`.
Registration is invite-only after the initial account. SMTP is not configured;
automatic recovery emails, invitations and emailed reports are unavailable.

## Website Integration

The main site's host Nginx configuration exposes exactly `/stats/script.js`
and `/stats/event`. Reinstall that configuration using the existing
`production/install-edge.sh` procedure when introducing these routes.
Website code still goes through the normal reviewed production deployment.
The loader runs only on `ks-design.art`, after page load and an idle callback.
Preview/local builds do not send analytics. The routes strip request cookies
and response `Set-Cookie` headers; the website CSP stays `script-src 'self'`.

The tracker records page views, attribution (including UTM parameters),
outbound links and contact-click events. Delaying it can miss very short
visits. Do not put personal data into URLs or event properties. The analytics
virtual host and event routes have access logging disabled.

## Backups And Operations

`ks-plausible-backup.timer` runs daily around 04:25 UTC. Root-only archives
in `/var/backups/ks-plausible` contain the PostgreSQL custom-format dump,
ClickHouse native backup, Compose configuration and application secret.
Completed archives older than 14 days are removed. These are local backups:
they do not protect against complete loss of the server; offsite storage
must be configured separately.

Check with `sudo systemctl status ks-plausible-backup.timer` and
`sudo journalctl -u ks-plausible-backup.service`. Run an extra backup with
`sudo systemctl start ks-plausible-backup.service`. Never publish archives
or `.env`; they contain credentials and collected analytics.

For recovery, first preserve the current state and stop ingestion. Extract
an archive into a root-only staging directory, restore its configuration
and secret, and start the same pinned database images. Restore
`postgres.dump` with `pg_restore` into an empty `plausible_db`; copy the
ClickHouse backup into its configured backups disk, then use
`RESTORE DATABASE plausible_events_db FROM Disk('backups', '<backup-name>')`
against an empty database. Start the application and verify `/api/health`,
login and historical reports before reopening ingestion. A full disaster
restore rehearsal has not been performed.
