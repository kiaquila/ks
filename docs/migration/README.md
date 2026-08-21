# KS production migration

This repository was created from the `ks/` project inside
`kiaquila/web-design`. Until the reviewed cutover pull request lands, the
production deployment stack is present but **disarmed**.

## What is parked

`docs/migration/pending/ks-production-deploy.yml` is the KS production deploy
workflow. It is a real workflow file kept outside `.github/workflows/`, so
GitHub never schedules it. A bootstrapped clone of this repository therefore has
no code path that can reach the production server, the Tailnet, Cloudflare, or
`ks-design.art`.

The file is parked, never deleted: the cutover pull request moves the same file
back into `.github/workflows/` after its content, credentials, and server-side
counterparts have been reviewed.

The workflow watches both `website/**` and its own
`.github/workflows/ks-production-deploy.yml` path. The cutover merge therefore
creates one honest first deployment without a fake product edit; later website
changes keep the normal product-only trigger. Both GitHub and cz independently
require the triggering SHA to remain the exact current `main` head.

## Invariant: exactly one production workflow

`tests/ks-production-deploy.test.mjs` fails when the workflow exists in both
locations or in neither, and it fails when a second workflow under
`.github/workflows/` declares the `production` environment. The old
`kiaquila/web-design` deploy workflow and this one must never be armed at the
same time.

## Cutover order

1. The new CI and production regression tests must pass on `main` and on the
   exact cutover PR head. The repository is public for the duration of the
   migration, so Actions run; the earlier failures were the private-repository
   allowance, not the workflows. Branch protection is available but not yet
   configured — until it is, the same-head green check and 120-second
   revalidation are a manual control rather than an enforced merge rule.
2. New, non-reused trust paths are provisioned alongside the old ones
   (action-to-server key, read-only source deploy key, trusted bare mirror,
   Cloudflare purge token, Tailscale OIDC client, `production` environment
   limited to `main`).
3. Resolve the separate Cloudflare Workers stage blocker recorded below. This
   does not route production, but the old repository must not remain a second
   source for the `ks` Worker.
4. Record the exact server state and disable the `kiaquila/web-design`
   production workflow. Verify its state is `disabled_manually` before touching
   the server trust path.
5. Run the reviewed existing-host migration from
   [`website/production/migrate-existing-host.sh`](../../website/production/migrate-existing-host.sh).
   Do not run `install-deploy-access.sh` on the existing host.
6. Revalidate the unchanged PR head and all required checks, wait 120 seconds,
   revalidate again, then mark the PR ready and merge it. The merge returns the workflow to
   `.github/workflows/`.
7. The workflow-path trigger deploys the merge commit. Verify the GitHub
   deployment, server image label, live asset hash, routes and security headers
   against that exact SHA.
8. Observe a rollback window. Only then retire the old credentials, old mirror,
   rollback image and old project path.

Steps 2 onwards require explicit authorization from the repository owner and are
not performed by the migration itself.

## Cloudflare Workers stage blocker

This Worker is a disposable preview/stage and is not the `ks-design.art`
production origin. The production workflow only uses Cloudflare's zone API to
purge the CDN cache in front of the `cz` origin.

Read-only dashboard evidence captured on 2026-08-21 shows that Workers Builds
for script `ks` still watches `kiaquila/web-design`, uses root `ks/website`, and
names `alex-neon build token` as its build token. The latest builds were caused
by the monorepo's template branch after that branch removed `ks/`, and the
dashboard reports the latest build failed. The last successful `main` build was
`9dc986a` (build `b0240e40-c5a4-42ec-b0f0-1a049c274bb5`, Worker version
`a82cc3f0-015a-4487-8a7d-2730b4dceaf9`). The permanent
`ks.ks-design.workers.dev` URL returns `404`, as intended by `workers_dev:
false`; preview URLs remain enabled.

Before the split is complete, give the Cloudflare GitHub App access to
`kiaquila/ks`, switch the Worker source to that repository and root `website`,
replace the cross-project build token with a dedicated KS build token, and
verify a PR preview. Disconnect the old source in the same maintenance window
so only one repository drives this Worker. None of these steps changes DNS or
turns the Worker into the production origin.

## Rollback

The recorded deployed revision and its source paths are in
[`provenance.md`](./provenance.md). Rolling back means restoring that revision
through whichever single workflow is armed at the time; it never means arming
both workflows at once.

The existing-host migration prints a root-only backup directory containing the
old wrapper, forced command, action authorization, source key, deployment state
and bare mirror. It also restores those files automatically if its transaction
fails. Keep that directory and the existing
`ks-design-portfolio:9dc986a9dcf5f50277fb780a1f1e43db3e66f91d` image through
the rollback window.

For a post-deploy rollback, first disable the standalone workflow. Under the
deployment lock, validate the backup with
`cd <backup-dir> && sha256sum -c manifest.sha256` — the migration wrote that
manifest over the old admission, state, wrapper, and source key when it made
the backup — then restore the old mirror and root-owned files from it, verify
the mirror again targets `kiaquila/web-design`, then
re-enable only the old workflow and redeploy the recorded revision. Do not
re-enable the old workflow while the standalone workflow is active. After the
rollback, repeat the production smoke checks and confirm the live asset hash is
`4f1be6722a491ce979844c7083cfacd9385cd4f31b2de90bfeab06552c44b200`.
