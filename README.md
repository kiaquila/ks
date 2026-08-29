# KS — Kristina Aquila portfolio

Bilingual selling landing page for Kristina Aquila's web design practice. It is
an original design rather than a redesign: the business, the offer and the
copy are the owner's own.

English is the default and is served at
[ks-design.art](https://ks-design.art); Argentinian Spanish is at `/es/`. The
old `/en/` prefix redirects permanently to the root.

The page is a **deck**: six sections, each one screen tall on desktop,
scrolling with snap points. On phones it is an ordinary flowing document. Each
section is opened by its heading and nothing else — the label above it and the
lead paragraph under it repeated what the heading already said.

1. Hero — headline left; on the right the portrait hangs like a print taped
   to the wall, tilted 5° with a paper shadow and a piece of masking tape.
   On hover it winks, and the owner's claims appear hand-written around it
   with curled arrows pointing at her, linking her channel, community,
   Instagram and Pinterest
2. Selected projects — screenshots at their own 8:5 proportion
3. Process — `01`–`04`
4. Services — three package cards
5. Kind Words
6. Get in touch — full-width band, then the footer directly under it

The header lists Process before Work (the owner reads the menu offer-first),
while the slides keep Work first.

Implementation lives in `website/`: static HTML/CSS/JS with no framework.
The customer stage remains on Cloudflare Workers; production is
[ks-design.art](https://ks-design.art), served from an isolated Docker Compose
project on the owner's `cz` server.

The hero's hover swap uses the original composite pair: the wink frame
registers the rock-expression source
[`source-assets/portrait-rock-reference.png`](./source-assets/portrait-rock-reference.png)
onto the fixed calm body (the production rules for that composite live in git
history). An interim second slide built from the
[`source-assets/hover-candidates/`](./source-assets/hover-candidates)
exposure was tried on 2026-08-27–28 and dropped; the hover returned, now
carrying the owner's claims as hand-written annotations in self-hosted
Caveat (OFL, beside the other font licenses).

## Source of truth

| Item | Value | Source |
| --- | --- | --- |
| Owner | Kristina Aquila | client |
| Location | Buenos Aires, Argentina | client |
| Email | `krisredlips@gmail.com` | client |
| Telegram | [@ks_aquila](https://t.me/ks_aquila) | client |
| LinkedIn | [kiaquila](https://www.linkedin.com/in/kiaquila) | client |
| Instagram | [ks_aquila](https://www.instagram.com/ks_aquila) | client |
| Pinterest | [ks_aquila](https://www.pinterest.com/ks_aquila/) | client, 2026-08-27 |
| AI channel (RU audience) | [@vibecodesh](https://t.me/vibecodesh) | client, 2026-08-27 |
| Mentored AI-engineers community | [invite link](https://t.me/+1k8AU1O9-o04MTRi) | client, 2026-08-27 |
| Hero annotation claims | %YEARS%+ years, not generic AI web design, AI expert, aesthetics and authenticity | client, 2026-08-28 |
| In web development since | 2017 | client |
| Argentinian Spanish translation | `/es/` copy | client-approved on 2026-08-17; the hero annotations (`hero.notes`) approved on 2026-08-28 |

Every string lives in [`website/src/content.js`](./website/src/content.js).
Nothing on the page is written anywhere else.

### Prices

Quoted by the client, in US dollars:

| Service | Price |
| --- | --- |
| Landing page | 500 |
| Website, 5+ pages | 1 500 |
| Illustrations | from 25 per image |

Menu build and dish photo retouching were on this list and have been taken off
it. The Chaijaná case study still says a menu and its dish photography were
part of that project, which is a record of work done rather than an offer.

### Portfolio entries

All four projects live in this repository and are linked to their public
stages, in the order the carousel shows them:
[Chaijaná Noir](https://chaijana.ks-design.workers.dev),
[Alex Neon](https://alex-neon.ks-design.workers.dev),
[Ember](https://ember.ks-design.art/) and
[Mikhail Orlov](https://misha.ks-design.workers.dev/). The card images are
screenshots of those stages at the section's 8:5 proportion, regenerated with
the commands in [`AGENTS.md`](./AGENTS.md).

Ember's card is not a resting screenshot: it is a frame taken about 1.3
seconds into the burn, while the figure is still whole and its lower edge is
alight.

## Open items

- **Kind Words is unfilled and hidden from published pages.** The section is
  built and styled, and the first
  card already carries Alex Oxitocin's name, role and avatar — but all three
  quotes are `TODO` placeholders, because the repository forbids inventing
  testimonials. The build prints a warning naming the section on every run,
  while the renderer omits the entire block until it is approved.
  Replace `kindWords.items` in `content.js` with real quotes and set
  `todo: false`.
- **The mentored-community link is a Telegram invite.** `t.me/+1k8AU1O9-…`
  is a joining credential rather than a public @username, and the page is
  indexable, so anyone who reads the markup can join. The owner supplied it
  for publication knowingly; turn on Telegram's join-request approval for
  that group, or swap in a public username, if that ever stops being wanted.

## Production hosting

The production origin is `https://ks-design.art`, which serves the English
page; `www.ks-design.art` redirects to it, and so does the retired `/en/`
prefix. Spaceship DNS points the apex to the server's public IPv4 and IPv6
addresses and aliases `www` to the apex. The server layout and repeatable
deployment procedure live in [`website/production/`](./website/production/).

Production uses the Compose project `ks-design-portfolio`, publishes its Nginx
container only on `127.0.0.1:3100`, and is routed by a dedicated host-Nginx
virtual host. It does not join, restart, or edit the `capsule-zero` Compose
project or its ports.

Changes under `website/**` deploy automatically from this repository after a
merged, fully checked pull request reaches `main`. GitHub Environment
configuration, server access, verification, cache purge, and recovery steps
are documented in
[`website/production/README.md`](./website/production/README.md). Cloudflare
Workers Builds creates pull-request previews from this repository at
`*-ks.ks-design.workers.dev`; its permanent `ks.ks-design.workers.dev` route is
disabled.

## Checks

From the repository root — repository policy, harness tests, the website build
and tests, and the payload budget in one pass (CI runs exactly this):

```bash
npm run preflight
```

Website build and tests alone:

```bash
npm --prefix website run check
```

Local preview:

```bash
npm --prefix website run dev
```

Every pull request also goes through the Codex review gate: the `Codex Review`
check stays red until Codex has reviewed the current head. Request a review by
commenting `@codex review <current-full-head-sha>` on the pull request — the
trusted gate binds the request to that exact 40-character head SHA.
