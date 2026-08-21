# Migration provenance

This repository was extracted from
[`kiaquila/web-design`](https://github.com/kiaquila/web-design) on 2026-08-20.

## Source identity

| Fact | Value |
| --- | --- |
| Source repository | `kiaquila/web-design` (public) |
| Source commit | `3b99cb3d23328013c28eb73ab8525b13b6992d9e` |
| `ks/` tree at that commit | `93d21fa6f975280f3d6e57fcf0c3051881494aaf` |
| Last deployed source commit | `9dc986a9dcf5f50277fb780a1f1e43db3e66f91d` |
| `ks/` tree at the deployed commit | `93d21fa6f975280f3d6e57fcf0c3051881494aaf` |

The two `ks/` trees are identical: `3b99cb3` changed only `ember/`, so the
migrated project content is byte-for-byte the source that production is
currently serving.

## What was extracted

`git filter-repo` kept `ks/` and renamed it to the repository root, and kept
four root artifacts at their original paths so their history survives:

- `.github/workflows/ks-production-deploy.yml` (parked before the reviewed
  cutover, see below);
- `scripts/wait-for-production-checks.mjs`;
- `tests/ks-production-deploy.test.mjs`;
- `tests/ks-production-server-deploy.test.mjs`.

121 commits that touched none of those paths were pruned; 22 were kept.

### Tree proof

Removing the three root artifact directories (`.github`, `scripts`, `tests`)
from the filtered tip and writing the remaining tree reproduces the source
`ks/` tree exactly:

```
93d21fa6f975280f3d6e57fcf0c3051881494aaf
```

`git fsck --full --strict` reports no corruption. The four preserved root
artifacts have the same blob hashes as in `kiaquila/web-design@9dc986a`:

| Path | Blob |
| --- | --- |
| `.github/workflows/ks-production-deploy.yml` | `5d76577f949d3c28215ccbd8168bc09cb193fb3c` |
| `scripts/wait-for-production-checks.mjs` | `74bc9273bd45966f30b09f6d67128616d94357b4` |
| `tests/ks-production-deploy.test.mjs` | `a6f2a3b46cbc02294dee023bf867028c1d4f4088` |
| `tests/ks-production-server-deploy.test.mjs` | `45dffdc99243c696eb8e3972a6925f9418934e4d` |

## Commit map

Old `kiaquila/web-design` commit to new `kiaquila/ks` commit, oldest first.

| web-design | ks | subject |
| --- | --- | --- |
| `495358228caeefb5bc1c971a73a3137c9ab96958` | `f5448a32ad31ff7f80270bd523f04f883610218a` | Add the KS bilingual portfolio landing (#31) |
| `fcca334d14d30af9c5c7193dd807e58265ca7379` | `6cb4a050d9c047ebf6cefe9f8c6e1db1df9678ff` | Add isolated production hosting for ks-design.art |
| `1e912a53205dd66dabc03a6f0c8641706f22521e` | `f11d029353f4e682b15b3b9a9b5828347e8b3edc` | Harden production deployment inputs and rollback |
| `7a30abd34bf178e37a7dd45068962e4c7f96ec13` | `6af7d304bc0463ef98c43f4f1c9eacc46b0e8cf0` | Keep draft testimonials out of production |
| `af39fd838894a220599a2f59f21087802eedac09` | `8cab8a9aa2a8934774988bb339d700387c262480` | Add isolated production hosting for ks-design.art (#33) |
| `91c9719a9362a887a7612b97acc19505a3d1236d` | `874691707293155114495f48034615f96f502398` | Fix KS hero rock expression (#34) |
| `6c51cca94b5c7e3bdfb807ab02d412fd6926370a` | `cb835e9df6479af6f64cf45ef73922ba9704e56b` | Configure KS production autodeploy |
| `9afe89aa47dc73c7266dc9064467678afa972d16` | `79f8885430b6034303417d3d59e1f0a2fb164075` | Gate deploy concurrency after CI |
| `1928d1ab05350f8baf44e3386a0bfe6007573e81` | `75f71435c2072df5a66f71edbef8faa1201e108e` | Reject stale KS production deploys |
| `ef10001c9819bbe9cd26aa5e401c68b5f07c25f6` | `b4e14c18a46c142d57517231f2265322ec4bc2fd` | Preserve latest gated KS deploy |
| `4ff5ac9c4ac1de5589f048d7533ce98c202650ad` | `aabbe3b3c711ee99e31b2ae4fae6b01a717a380e` | Deploy current KS tree after unrelated pushes |
| `24b7a637466d978f7b888adcce440b170ebf31e8` | `bb5098e20cc761fbeafc980e16b53f5b6b1c77ea` | Verify KS routes after cache purge |
| `608d19ebba52955b1ab84112b4d084de1c47cafb` | `e9e26d2e7f93ced96c78ffb579e018eb81a9279d` | Harden KS deployment through Tailscale SSH |
| `0f91c0f2ac5d36ea2f8e2ab57c68848307e1cbcc` | `f730e86232b2990d3ceec165b0d454ad8acf5517` | Harden KS production deploy admission |
| `30eb6c95348b52f35caa69939f3035c06d2193f9` | `a5cd258252ec171a27274d327e56c898548c6945` | Keep gated KS deployments reachable |
| `4de5a8efaa97fe742802cb4792914318f6cb5330` | `faffc91595ad9b9717a00eaf2d91d32c358d788d` | Protect the KS trusted source mirror |
| `d5bb4b003b71990096dd8d21899d3ab61240dca8` | `cc50a62e83d806262c63ed52b34fdb7fbad8481a` | Restrict KS deploy SSH admission |
| `c13d8636db6cbf1bfd27894fee9ff4839043fe99` | `e09626860307a2815a07f4832585baba7681e638` | Fix KS production revision inspection |
| `df5d9186db89c56e73585acdc1263d6d7c67fefc` | `163aa96319a8c11f7e20af9e1a74b5e821469e2d` | Refresh the KS landing and add Argentinian Spanish (#40) |
| `579e57cc758a1ef3b9e10220a75bbb85c402f28f` | `d7d38c3d6c4a7b24365b3fa661eaaf990a5abed7` | Fix KS production access and legacy redirects (#41) |
| `86a98e0882d0850d09b71f83fabc120e23f67c7a` | `6e32914f4898c8bec54f3e027112f6102a8694ba` | Fix the KS hover portrait's jaw line and neck seam (#43) |
| `9dc986a9dcf5f50277fb780a1f1e43db3e66f91d` | `6fce3353e4a894210646d94699ca6b8652df910a` | Add the Ember lab study and the ks·design wordmark (#44) |

Commits added by the migration itself are listed below this table in
`git log`; they have no `web-design` counterpart.

## Baseline pin

| Fact | Value |
| --- | --- |
| Governance source | `kiaquila/web-design` |
| Pinned version | `0.1.0-dev` (provisional) |
| Pinned commit | `f042879d8b6d11cc80021bb19cc4aacd645cc621` |
| Branch it lives on | `codex/web-design-template-v2` (draft PR #46) |
| Profile | `custom-production` |

**Required follow-up.** `0.1.0-dev` is a prerelease source state on a draft
branch, not an immutable release. After draft PR
[#46](https://github.com/kiaquila/web-design/pull/46) merges and
`kiaquila/web-design` publishes its first immutable stable release, re-pin this
project to that release's full SHA through a separate reviewed pull request
(`.github/workflows/web-design-update.yml`, or `npm run sync:web-design`).
Until then the baseline guard validates managed bytes against this commit.

## Recorded production state at migration time

This is the rollback target. It is the state of `ks-design.art` before any
cutover.

| Fact | Value |
| --- | --- |
| Deployed source revision | `9dc986a9dcf5f50277fb780a1f1e43db3e66f91d` |
| GitHub deployment | `kiaquila/web-design` environment `production`, id `6007096995` |
| Deploy workflow run | `32396226076` (`success`, 2026-08-20T17:11:33Z) |
| Compose project | `ks-design-portfolio` on `127.0.0.1:3100` |
| Remote directory | `/opt/ks-design-portfolio` |
| Trusted source mirror | `/var/lib/ks-production/source.git` |
| Live `/assets/site.js` SHA-256 | `4f1be6722a491ce979844c7083cfacd9385cd4f31b2de90bfeab06552c44b200` |

The live asset hash equals
`sha256(kiaquila/web-design@9dc986a:ks/website/src/js/site.js)`, so the served
bytes and the recorded revision agree.

Public baseline captured at 2026-08-20T22:26Z:

- `GET /` → `200`, `content-type: text/html`
- `GET /es/` → `200`
- `GET /en/` → `301` to `https://ks-design.art/`
- `GET https://www.ks-design.art/` → `301` to `https://ks-design.art/`
- `strict-transport-security: max-age=31536000; includeSubDomains`
- `x-frame-options: DENY`, `x-content-type-options: nosniff`
- `referrer-policy: strict-origin-when-cross-origin`
- `cross-origin-opener-policy: same-origin`
- `content-security-policy: default-src 'self'; base-uri 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests`
- `permissions-policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()`

## Environment names in the source repository

Names only; no value was read, copied, or recorded.

`kiaquila/web-design` environment `production`, deployment branch policy
limited to `main`:

- secrets: `CLOUDFLARE_API_TOKEN`, `KS_DESIGN_SSH_PRIVATE_KEY`
- variables: `CLOUDFLARE_ZONE_ID`, `KS_DESIGN_SSH_HOST`,
  `KS_DESIGN_SSH_KNOWN_HOSTS`, `TAILSCALE_AUDIENCE`,
  `TAILSCALE_OAUTH_CLIENT_ID`

There are no repository-level Actions secrets or variables. `kiaquila/ks` must
receive **new** values under the same names; nothing is reused, and no old
credential is revoked until the rollback window closes.

## Cloudflare

The KS Cloudflare Worker is preview-only and stays that way.
`website/wrangler.json` keeps `"name": "ks"`, `"workers_dev": false`, and
`"preview_urls": true`; the permanent `ks.ks-design.workers.dev` route remains
disabled. Reconnecting the Git integration to this repository changes only the
watched repository and the root directory (`ks/website` → `website`). DNS is
not touched.
