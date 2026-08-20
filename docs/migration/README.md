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

## Invariant: exactly one production workflow

`tests/ks-production-deploy.test.mjs` fails when the workflow exists in both
locations or in neither, and it fails when a second workflow under
`.github/workflows/` declares the `production` environment. The old
`kiaquila/web-design` deploy workflow and this one must never be armed at the
same time.

## Cutover order

1. The new CI and production regression tests pass on `main`.
2. New, non-reused trust paths are provisioned alongside the old ones
   (action-to-server key, read-only source deploy key, trusted bare mirror,
   Cloudflare purge token, Tailscale OIDC client, `production` environment
   limited to `main`).
3. The `kiaquila/web-design` production workflow is disabled.
4. The server wrapper and the trusted source mirror are pointed at this
   repository.
5. The reviewed cutover pull request returns the workflow to
   `.github/workflows/`.
6. The resulting deployment is verified against the exact commit SHA.
7. A rollback window is observed.
8. Only then are the old credentials and the old project path retired.

Steps 2 onwards require explicit authorization from the repository owner and are
not performed by the migration itself.

## Rollback

The recorded deployed revision and its source paths are in
[`provenance.md`](./provenance.md). Rolling back means restoring that revision
through whichever single workflow is armed at the time; it never means arming
both workflows at once.
