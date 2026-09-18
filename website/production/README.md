# KS production hosting

Production serves the static build at `https://ks-design.art` from the `cz`
server. Cloudflare Workers remains a disposable stage, not the production
origin.

## Isolation contract

- Compose project: `ks-design-portfolio`
- Container listener: `8080`
- Host binding: `127.0.0.1:3100`
- Host edge: `/etc/nginx/sites-available/ks-design.art.conf`
- Server source directory: `/opt/ks-design-portfolio`
- TLS: Let's Encrypt certificate named `ks-design.art`

The deployment does not use the Capsule Zero Compose file, project, network,
volumes, images, or loopback ports (`3000`, `8080`, `4433`, and `5432`). The
deploy script snapshots the running Capsule Zero container IDs before and after
the portfolio update and fails if they change.

## DNS

Spaceship Advanced DNS carries these records with a 30-minute TTL:

| Host | Type | Value |
| --- | --- | --- |
| `@` | `A` | `178.105.95.17` |
| `@` | `AAAA` | `2a01:4f8:1c18:af10::1` |
| `www` | `CNAME` | `ks-design.art` |

## Deployment

Production deploys automatically after a merged pull request changes `website/**`
and the resulting push to `main` passes every push check plus the required
checks on the reviewed pull-request head. A direct push, a pull-request event,
or a red/missing check fails closed before production credentials are exposed.

The workflow is [`.github/workflows/ks-production-deploy.yml`](../../.github/workflows/ks-production-deploy.yml).
It uses the GitHub Environment `production`, whose deployment branch policy
must allow `main` only. Its current protection is one custom branch policy for
`main`; there is no wait timer or required-reviewer rule, and administrators
may bypass the Environment. Configure these Environment values:

| Kind | Name | Purpose |
| --- | --- | --- |
| Variable | `CLOUDFLARE_ZONE_ID` | Public zone ID for `ks-design.art` |
| Variable | `KS_DESIGN_SSH_HOST` | cz Tailnet IP or MagicDNS name |
| Variable | `KS_DESIGN_SSH_KNOWN_HOSTS` | Pinned cz SSH host key in `known_hosts` format |
| Variable | `TAILSCALE_OAUTH_CLIENT_ID` | Tailnet workload-identity OAuth client ID |
| Variable | `TAILSCALE_AUDIENCE` | Audience configured for the GitHub workload identity |
| Secret | `CLOUDFLARE_API_TOKEN` | Token scoped to Cache Purge for the single zone |
| Secret | `KS_DESIGN_SSH_PRIVATE_KEY` | Deploy-only key for the `ksdeploy` account on cz |

The environment currently contains exactly those five variables and two
secrets. GitHub exposes their names and update times for audit, but not the
secret values; do not copy credentials into this document.

Both jobs run on GitHub-hosted infrastructure. Only the registration and
deployment jobs join the private Tailnet through Tailscale workload identity
federation, after their required checks have passed and the `production`
Environment has released the deploy key. cz accepts the deploy-only `ksdeploy`
SSH key over that Tailnet; no public SSH exposure or long-lived Tailscale auth
key is used. SSH admits the key through the root-owned
`/usr/local/sbin/ks-production-ssh-command` forced-command handler with
`restrict`: it has no shell, forwarding, or ability to alter its own
`authorized_keys`. That file stays root-owned and is group-readable by
`ksdeploy` only so `sshd` can inspect the public key. The handler permits only
the fixed staging commands and the root-owned
`/usr/local/sbin/ks-production-deploy` wrapper. The registration job receives
no Cloudflare token.

After checks pass, every candidate first registers its GitHub run ID with cz.
Only a candidate still recorded as newest can enter the
`ks-production-deploy` concurrency group. The root-owned wrapper serializes
registration and mutation with `flock`, so a late stale gate cannot evict the
newest pending job through GitHub's one-pending-job behavior. An unrelated
repository push does not register a KS candidate.

The wrapper treats the staged directory as untrusted. It independently fetches
`main` with a root-owned, read-only GitHub deploy key, requires the current
trusted `website` tree to equal the candidate, archives `website` from the
validated revision, and byte-compares it with the staged payload before Docker
can read it. This deliberately permits an unrelated later repository commit
when `website/` itself has not changed. The root source mirror is
`/var/lib/ks-production/source.git`; its
key is `/root/.ssh/ks-production-source` and is separate from the GitHub
Actions SSH key.

One-time cz setup creates an Ed25519 key at
`/root/.ssh/ks-production-source`, adds its public half to this repository as a
**read-only GitHub deploy key**, and pins GitHub's SSH host key in
`/root/.ssh/known_hosts`. The current GitHub key is named
`ks-production-source-readonly`, is verified and read-only, and has fingerprint
`SHA256:RPnJD/95nb0aNttwCKbeaJVbbW1KTvf7laGmGWgYGA0`. The private key remains
root-readable only and is not the GitHub Environment secret used by Actions.
Then install the reviewed wrapper and create the restricted account and staging
directory. This is an administrator operation; normal production recovery
uses the checked workflow rather than an interactive SSH session:

```bash
sudo website/production/install-deploy-access.sh 'ssh-ed25519 AAAA… github-production'
```

The 2026-08-27 cutover retargeted the existing source mirror from
`kiaquila/web-design` to `kiaquila/ks` and moved the read-only source key to the
standalone repository. That migration is complete: `kiaquila/web-design` has no
KS deploy key, and its former `ks/` tree was removed on 2026-09-17. Neither the
old repository nor that deleted tree is a backup source or a rollback route.
The standalone wrapper records ordering in
`/var/lib/ks-production/latest-candidate-ks`, separate from the monorepo state,
because Actions run IDs are ordered only within one repository. The current
installer still contains a migration-only branch for the completed retarget;
its removal belongs in a separate production-code change with tests.

## Recovery and rollback

A normal source rollback is a reviewed revert in `kiaquila/ks` followed by the
same gated `main` workflow. The deleted `kiaquila/web-design:ks/` tree cannot be
used for it. The server also retains revision-tagged
`ks-design-portfolio:<full-sha>` Docker images as local emergency rollback
packages, but the automation never selects an older image and there is no
scripted rollback command; using one is an explicit administrator recovery.

In the 2026-09-18 read-only audit, production was healthy on
`bee5adf5a28cf1a8f83704faead0596db5a06002` and the immediately preceding
rollback package was
`ks-design-portfolio:20fa80961aa41955ce73d96ba7a22a4f67663aa5`
(`sha256:1ef6553c693baadba4c2a405668c02e29a6fe6e307f142a4f449754e4e03845c`).
Treat those values as a dated audit record, not a permanent rollback target;
re-check the running revision and local image inventory before any recovery.

The same audit verified that `/var/lib/ks-production/source.git` has origin
`git@github.com:kiaquila/ks.git` and `refs/remotes/origin/main` at
`bee5adf5a28cf1a8f83704faead0596db5a06002`. The mirror, source private key,
known-hosts file and candidate state are root-only; the forced-command
`authorized_keys` file is root-owned and group-readable by `ksdeploy`.

The first server installation, or an intentional TLS/edge refresh, is:

```bash
website/production/install-edge.sh
```

On a first install, the edge installer loads the HTTP-only ACME virtual host,
obtains the certificate through the server's existing Certbot account, then
installs the TLS virtual host. On refresh it keeps the existing TLS edge live
while Certbot runs and restores the previous configuration if validation,
reload, or the final health check fails. Every Nginx change is checked with
`nginx -t` before reload.

## Verification

`/` serves English and `/es/` serves Argentinian Spanish. `/en/` is the retired
English prefix, which answers `301` to the root so links published before the
move keep working.

Automation verifies that Compose reports the container `healthy`, the image
label `org.opencontainers.image.revision` equals the triggering `github.sha`,
and both the English `/` and Spanish `/es/` pages return successfully without a
redirect after the Cloudflare cache purge. The retired `/en/` redirect remains
a separate manual verification below.
It then compares the SHA-256 of live `/assets/site.js` with
`website/src/js/site.js` from that exact commit.

```bash
dig +short A ks-design.art
dig +short AAAA ks-design.art
curl -I https://ks-design.art/
curl -I https://ks-design.art/es/
curl -I https://ks-design.art/en/
curl -I https://www.ks-design.art/
ssh cz 'sudo docker compose -f /opt/ks-design-portfolio/production/docker-compose.yml ps'
```

Cloudflare Workers Builds is connected to `kiaquila/ks` with `main` as the
production branch and `website` as the root directory. It runs `npm run build`,
uses `npm run stage:deploy` for `main`, and uses
`npx wrangler versions upload` for non-production branches. Pull-request
previews are available at `*-ks.ks-design.workers.dev`. The permanent Worker
URL `ks.ks-design.workers.dev` remains disabled and is not a production
fallback.

For the same audited revision, the latest
[KS Production Deploy](https://github.com/kiaquila/ks/actions/runs/35347910401)
completed successfully, including `production-required-checks`,
`production-register-latest` and `production-deploy`. The external
[Workers Builds: ks](https://dash.cloudflare.com/7f84bdf4279121edf62bc07caf300da2/workers/services/view/ks/production/builds/63a74d42-88f8-49c8-ac9c-10d0cccc4243)
check also completed successfully on that exact SHA.
