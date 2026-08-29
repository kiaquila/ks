# AGENTS.md — KS

Original selling landing for Kristina Aquila's web design practice. Bilingual:
**English is the default and serves `/`**, Argentinian Spanish is at `/es/`, and
the retired `/en/` prefix redirects to the root. Read
[`README.md`](./README.md) first for the verified facts and the open items.

## Identity

The reference is a printed café menu card: white paper, black ink, hairline
rules, heavy tracked capitals. Everything below follows from that.

- **The palette is achromatic but for the wordmark's dot.** White ground,
  near-black ink, a short grey ramp — no accent colour on links, buttons or any
  other UI. Hierarchy is carried by weight, tracking, rules and scale, the way
  it is on paper. The single sanctioned exception (client decision,
  2026-08-28, replacing the brand-gold amber of 2026-08-19) is the
  cornflower gradient `--brand-dot` on the wordmark dot described below. A
  test walks every hex colour in the compiled stylesheet, allows exactly the
  gradient's two stops, and fails any other whose RGB channels spread more
  than 12, so a stray accent cannot slip in.
- Type is two working families, both already licensed in this repository:
  **Manrope** for the wordmark, headings, navigation and body; **Playfair
  Display** for the chapter numerals, the pull quotes and the italic line in
  the contact band — nowhere else. The single sanctioned exception (client
  decision, 2026-08-28) is **Caveat**, the hand-written voice of the hero
  portrait's hover annotations and of nothing else; see "The hero portrait".
  Do not add a fourth family.
- Headings are uppercase with open tracking (`0.06em`–`0.09em`), not tight
  display type.
- **The header is set in two voices, not one.** The wordmark and the
  navigation links share `0.78rem`/`0.14em` (client pick, 2026-08-29,
  reversing the one-step-down trial of 2026-08-28: at `0.72rem` the links
  read too quiet next to the mark); the language switch alone stays a step
  below at `0.72rem`/`0.09em` — it is a utility, not a signpost. The
  collapsed mobile menu is a separate context: it takes the switch's
  `0.09em` tracking but keeps its own larger `0.9rem`, because a
  full-screen menu is read at arm's length. On phones the switch sits
  against the hamburger at the right edge (auto margin on
  `.header-actions`), not mid-row. The switch's underline is measured
  against its word — `1.45rem` for two caps at this setting — so re-measure
  `.lang-current::after` if that type moves again.
- **A section is opened by its heading and nothing else.** The small-caps label
  over a rule and the lead paragraph beneath both restated the heading, so all
  three of them said one thing three times; the label and the lead are gone and
  the `.eyebrow` rule with them. Do not reintroduce either — if a section needs
  explaining, the heading is wrong. The one lead paragraph left on the site is
  on the 404 page, which has no hierarchy to explain itself with.
- **One call to action per screen.** "Start a project" belongs to the hero. The
  header's top-right button is Contact, and the services head carries no button
  at all; a test counts the hero's label and fails at two.
- The language switch is two small words separated by a slash, the current one
  underlined — printed, not app-like. Each is a 44px target and a plain link.
- **Portfolio screenshots are shown at their own 8:5 proportion**, never cropped
  and never stretched: a card that reframes the work is showing something the
  client never designed. The shot sets no height and no `object-fit`. When the
  slide is too short for the cards at that ratio, `.work-track` narrows them —
  the container is left alone so the heading keeps the section's left edge.
- The process numerals grow slightly on hover. Any motion added here stays at
  that scale: a transform on one element, killed by `prefers-reduced-motion`.
- The wordmark is **typography, not an image**: `ks·design` set in Manrope as
  tracked uppercase at `0.78rem`/`0.14em` — a step above the navigation
  beside it, so the header has one voice and one echo — with a cornflower dot
  on the baseline between the two words — nearer the KS than the DESIGN in a 1:2
  proportion (position: client decision, 2026-08-19; the dot replaced the
  hyphen of the earlier bold lowercase `ks-design`). The dot uses
  `--brand-dot`, an indigo-to-cyan gradient at 135° (client decision,
  2026-08-28, picked from a 20-variant show as «Васильковый»; it replaced
  the flat `--brand-gold`), the page's only chromatic device, and a test
  allows exactly its two hexes and no other colour. There is still no logo
  image, and the old gradient monogram is gone and should not come back.
  Running text and footer credits keep plain `ks-design`; the mark is a
  header-only device. The favicon carries the same treatment as a type-set
  `KS.` (run edge to edge — at a crowded tab strip's 16px, any margin
  reads as a shrunken icon) in three files, all with the gradient dot: the
  SVG with dark-scheme inversion for modern engines; a `/favicon.ico` at
  the site root (16/32/48, dark caps on TRANSPARENCY — the mark carries no
  plate, client decision 2026-08-29) because browsers ask for that path on
  their own and a 404 there costs the tab its icon; and the apple-touch
  PNG, the one rendition that keeps a white plate, because iOS composes
  home-screen icons on arbitrary wallpapers. **The SVG is deliberately the
  only `rel="icon"` link.** Declaring the ico too made Chrome choose it —
  even against `sizes="any"` on the SVG — and a static raster cannot flip
  white in a dark theme; engines without SVG favicons find the root file
  by convention on their own. The two declared links carry the same `?v=`
  and it is bumped whenever those icons' pixels change — browsers cache
  favicons far past the page. The root ico has no version to bump (the
  path is the convention), so a returning legacy visitor may hold the old
  one until their cache expires; that is the accepted cost of the
  convention.
- The footer is **one horizontal row directly under the contact band**, and the
  pair is anchored to the bottom of the last slide: copyright hard left, a pin
  icon and the location centred on the page, social icons with no labels hard
  right (LinkedIn and Telegram — Instagram and Pinterest live in the hero's
  hand-written annotations instead, client decision 2026-08-28). Its outer grid columns are `1fr` so the
  middle one centres on the page rather than on the copyright. It carries no
  rule on top — the black band above it already divides the page, and the band
  must not be pushed away from it by a spacer row.
- Tone: calm, concrete, premium. No urgency timers, no invented counters, no
  exclamation marks.

## The deck

Each section is a `.slide`. Above `900px` wide **and** `660px` tall the page
becomes a deck: every slide is one viewport and the page snaps between them.
Below that it is an ordinary flowing document.

- Slides use `min-height: 100svh`, never a fixed `height` with
  `overflow: hidden`. A slide is exactly one screen whenever its content fits
  and grows instead of clipping when it does not — silently eating the last
  line of copy on a short laptop window is worse than a slide that scrolls.
- The work slide preserves each screenshot's 8:5 ratio by letting height follow
  width. In deck mode, `.work-track` therefore caps its width from the viewport
  height left after the header, container padding, heading and card meta:
  `(100svh - var(--header-h) - 25rem) × 1.6 × 2`, plus the card gap. Cap the
  track rather than `.work > .container`, so the cards narrow on short screens
  while the heading keeps the same left edge as every other slide. If those
  vertical allowances change, re-measure the `25rem` term rather than assume.
- Entrance reveals are claimed by the script (`html.reveal-on`), never written
  into the markup. A visitor without JavaScript, or with reduced motion, gets
  every slide fully visible.

## Content

- Source of truth is [`src/content.js`](./website/src/content.js). Every string
  on the page comes from there, in every language. A key that exists in one
  language must exist in all of them, and `languages` declares both the URL for
  each locale and the order the switch renders in.
- The years of experience are derived from `CAREER_START_YEAR`, never typed. A
  literal number passes today and lies next January.
- Do not invent facts, prices, testimonials, client names or dates. Kind Words
  is deliberately unfilled and must remain absent from published pages while
  its content is marked `todo`; see README.
- A translation the owner has not signed off on is not final copy either. List
  such a locale in `localesAwaitingReview` and the build names it on every run,
  the way it names placeholder sections. The owner approved the current `es`
  copy on 2026-08-17, so it is not on that list.
- The years of experience are **derived** from `CAREER_START_YEAR`, never typed.
  Copy uses the `%YEARS%` placeholder. A test fails if the literal is hardcoded.
- Approved external destinations are listed in `links`. A test rejects any other
  outbound origin.

## Implementation

- Static, no framework: `src/content.js` (copy), `src/render.js` (markup),
  five style layers `src/styles/{tokens,base,layout,components,sections}.css`
  concatenated in that order, and one classic script `src/js/site.js`.
- **`assets/site.js` ships byte for byte as it was written.** The build only
  copies it: no strip, no minify. The production deploy verifies the
  deployed file against `src/js/site.js` by sha256, so any transformation
  passes CI, deploys, and then fails the release with no message — a comment
  strip did exactly that on 2026-08-29 and cost a red deploy. A test asserts
  the shipped file equals the source.
- JavaScript budget: **4 KB gzipped**, and because the shipped file is the
  source file, that one number bounds both what a visitor downloads and what
  a maintainer writes. If it is ever hit, remove behaviour — or prose — never
  raise the number and never ship something other than the source.
- **The layers are concatenated, so a media query in an earlier layer loses to a
  plain rule in a later one.** A component's responsive rules belong in that
  component's layer. This has already bitten once: `.header-cta { display:none }`
  written in `layout.css` was overridden by `.btn { display:inline-flex }` in
  `components.css`, and the header overflowed every phone. That rule now lives
  in `components.css`.
- `site.js` is enhancement only. Nothing may be hidden in the markup waiting for
  a script: the nav is a visible list until the script collapses it, the
  carousel is a native scroll container until the script adds buttons, and the
  portrait swaps on hover in pure CSS. A test asserts the markup ships nothing
  pre-hidden.
- **The collapsed menu leaves the tab order through CSS `visibility`, and that
  property is never transitioned.** Clip-path, opacity and pointer-events hide
  it from the eye and the mouse but leave every link keyboard-focusable. Every
  way of animating `visibility` — a delay, or `allow-discrete` — holds the
  computed value at `visible` until the animation ends, leaving a window in
  which Shift+Tab reaches a menu that went invisible 100ms ago. Both were tried
  and both were wrong. The menu therefore closes instantly and only opening
  animates; that is the deliberate price of the guarantee.
  Keeping this in CSS rather than toggling `inert` from the script means it
  tracks the media query exactly and cannot go stale — a script-held copy of
  the breakpoint got the desktop navigation inert and keyboard-unreachable
  while this was being built.
- **The hamburger is shown by `.site-nav[data-collapsed] ~ .nav-toggle`, never
  by the breakpoint alone.** `data-collapsed` is set by the script, so without
  JavaScript the toggle stays hidden instead of sitting there dead beside a
  menu it cannot open. In that no-script case the header drops out of `fixed`
  and wraps, because four tracked links plus the wordmark and the language
  switch do not fit one 360px row.
- **Contact is reachable at every width and duplicated at none.** Above 900px
  the solid header button carries it and `.nav-contact` is hidden; below 900px
  the button is hidden and the collapsed menu carries it. The two rules are
  exact mirrors and live side by side in `components.css` for that reason —
  changing one without the other either loses Contact on phones or prints it
  twice on desktop. A test asserts both rules exist.
- **Every tap target is at least 44px**, including both language words, the
  footer social icons and the carousel arrows. A test measures the rules. On
  phones the header row's gaps shrink rather than the targets.
- No external origins at all: no CDN, no analytics, no remote fonts or images.
  The Worker's CSP is `script-src 'self'` and there are no inline `<script>`
  elements — the test enforces both.
- JavaScript budget: **4 KB gzipped**. If it is ever hit, remove behaviour
  rather than raising the number.
- Accessibility: one `h1` per page, AA contrast, visible `:focus-visible`, tap
  targets ≥ 44 px, `prefers-reduced-motion` disables every transition.
- Production is `https://ks-design.art`. Keep canonical, Open Graph, sitemap,
  and robots URLs on that origin even when a Cloudflare stage builds the same
  source.
- The production Compose project is `ks-design-portfolio` and may publish only
  `127.0.0.1:3100`. Do not reuse the `capsule-zero` Compose project, networks,
  volumes, images, ports, or Nginx configuration.
- Production deploys from this repository when a checked merge changes
  `website/**`. Keep the workflow at
  `.github/workflows/ks-production-deploy.yml`, the gate at
  `scripts/wait-for-production-checks.mjs`, and the server path under
  `website/production/`; the trusted server mirror is `kiaquila/ks`.

## The hero portrait

- Two frames cross-fade in the same box on hover: `assets/portrait/calm-*`
  and `assets/portrait/wink-*` — the original composite pair, restored on
  2026-08-28 after a two-day experiment with a separate Why me slide. The
  wink frame is the composite described in `README.md` (the rock-expression
  face registered onto the calm body); its production rules live in git
  history with the retired experiments. Both frames sit at `?v=2`: their
  pixels are the ones production has always served.
- The cross-fade is ~140 ms on purpose: at that speed the eye reads a cut —
  the requested gif feel — not a slideshow dissolve. Touch toggles the swap
  through `data-active` (set by the script), keyboard through focus. The
  script drops the tap's own focus when it toggles off: a tap also focuses
  the frame, and `:focus-within` would otherwise hold the swap on and make
  the second tap look dead.
- **From 1100px up the hero is the "taped print"** (client pick from a
  20-variant show, 2026-08-28): a plain white page, the copy nudged slightly
  right, and the photograph hanging on the right like a print stuck to the
  wall — the whole `.portrait-box` tilted **5° counter-clockwise**, a soft
  paper drop shadow on `.portrait`, and a `.tape` span of semi-translucent
  masking tape over the top edge (it lands on the photographed wall, never
  the hair). The print hangs at `left: 35%` of the `.hero-portrait` zone
  (which spans the right 62% of the slide), `top: calc(20svh - 10px)`
  (nudged right and down from 30%/13svh, then 10px back up — both client
  picks, 2026-08-29), and is
  **width-driven**: `--print-w: min(54svh, calc(42vw - 220px))`, with
  `left: min(35%, calc(100% - var(--print-w) - 232px))`. The third width
  term and the capped left are the air guarantee for the two right-hand
  notes: on 1280×800-class laptops the 54svh print used to reach the
  viewport edge and clip their text. Both caps are plain `min()` terms, so
  they bite together as the viewport tightens — the print slides left of
  its preferred hang AND gives up width at the same time, rather than ever
  touching the notes. 35% / 54svh are ceilings, not fixtures: the print
  returns to them as soon as the viewport affords the air (on tall wide
  windows the left cap still trims a few percent). Keep the
  `sizes` attribute in `render.js` equal to that width. There is no
  background field: the page's own white is the wall.
- **Below 1100px the hero flows instead**: portrait first, then the copy,
  then the notes as a plain hand-written list under the photo — no tilt, no
  tape, no shadow, nothing revealed by hover. The scattered treatment needs
  a column of white beside the print for the notes to live in, and a narrow
  desktop has none: squeezing them in put ink on the black sweater and
  across the face. A test pins both halves of this split.
- **The stage and the portrait are direct children of the slide, never of
  `.container`.** The entrance reveal transforms the container, and a
  transformed ancestor becomes the containing block of absolutely-positioned
  descendants — the photo would ride the reveal and anchor to the wrong box.
  This bit once; do not move the portrait back inside.
- **Three rules keep the hover honest, and they only work together**: the
  `.hero-portrait` zone takes no pointer events (it reaches back under the
  copy, and as a live sheet it ate a third of "See the work" at laptop
  widths); the revealed `.portrait-notes` layer takes them back, so the
  cursor can cross the white between print and link without the set folding
  away; and `.hero-copy` is lifted to `z-index: 1` so its buttons win
  wherever the layer overlaps them. A test asserts all three.
- On hover the frosted stats panel of old is replaced by **hand-written
  annotations** (`.portrait-notes`): the owner's claims in Caveat, ink on the
  white around the print — "%YEARS%+ years in web development" and "AI
  expert" with its join-links in the pocket under the headline, "I do
  non-generic AI web design" and the aesthetics claim with its follow-links
  on the right air — each with a small curled arrow pointing at her, each
  link with its own transition arrow. The arrows are children of their note,
  so they travel with the text they belong to. The layer sits OUTSIDE
  `role="img"`, where the claims and links would be silent for assistive
  tech; links are real 44px targets, and the touch-target test names
  `.note-link` explicitly. Keep notes off the face and off the dark sweater —
  ink dies there.
- Caveat is the **one sanctioned third family** (client decision,
  2026-08-28): a single static 600 weight, subset to ASCII plus the Spanish
  lowercase accents the notes set, self-hosted like the other faces with its
  OFL text beside it. It exists for the annotations only — never for UI or
  running text. A test walks every note string against the subset, because a
  missing glyph falls back to a system script mid-word rather than failing
  loudly. **The font budget is now nearly spent** — 202 940 B of 204 800 —
  so widening that subset means re-subsetting another face or raising the
  budget deliberately, not quietly.

## Dependencies

The only dependency is `wrangler`, and it is needed for deployment, never for
`npm run build` or the tests — those use Node builtins alone.

Wrangler `4.124.0` resolves Miniflare's direct `undici` `7.29.0` dependency,
so the earlier `package.json` override has been retired. Keep it unpinned so
future Wrangler updates can take their upstream security fixes; regenerate the
lockfile with `npm install --package-lock-only` when dependency resolution
changes.

## Regenerating assets

The social card renders the real page fonts through headless Chrome, so it
cannot drift from the design:

```bash
node website/scripts/make-og.mjs
```

The raster favicons are derived from `assets/favicon.svg` the same way —
headless Chrome for the pixels, sips for the small sizes (macOS, like the
screenshot recipes below). Rerun whenever the SVG's geometry moves; the ico
and the apple-touch plate must never be edited by hand:

```bash
node website/scripts/make-icons.mjs
```

Portfolio card screenshots, from the live stages. Every card is 1200×750 and
800×500 in both JPEG and WebP, so a new shot must be taken at the section's
8:5 proportion rather than cropped into it:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1440,900 --virtual-time-budget=9000 --screenshot=shot.png https://chaijana.ks-design.workers.dev
```

Two cards need more than that flag. Ember's shot must catch the animation
mid-burn, so it is taken through the DevTools protocol: open the study, click
Play, wait about 1.3 seconds, then capture — a plain `--screenshot` grabs the
resting figure. Mikhail Orlov's page holds its entrance reveals until the
content scrolls into view, so a wide window screenshots as an empty sheet;
shoot it at 1000×625 (or drive it over the protocol with a pause after load)
and scale to the card sizes.

Neither is part of `npm run build`; both outputs are committed.

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

Every pull request must pass the Codex review gate: the `Codex Review` check
validates that Codex has reviewed the current head. Request a review by
commenting `@codex review <current-full-head-sha>` on the pull request — the
trusted gate binds the request to that exact 40-character head SHA. Once
Codex posts its evidence, `codex-review-rerun.yml` re-runs the gate
automatically. The one exception is an installation PR — while the gate is
not on the default branch yet, GitHub cannot trigger the comment- and
review-driven workflows, so after Codex responds, re-run the failed gate run
by hand: `gh run rerun <run-id> --failed`. The gate's workflows and runtime
scripts are listed as required files in `scripts/check-repository.mjs`;
removing the guardrail is a deliberate separate decision, never an omission.

Tests cover the client's wording, the price list, the multilingual contract
(English at `/` as `x-default`, `hreflang` for both, no untranslated Russian in
either page, one `404.html` per locale, the `/en/` redirect), the
one-meaning-per-section and one-CTA-per-screen rules, the footer row, the
screenshots' fixed proportion, approved outbound links, local-only assets, the no-JavaScript guarantee,
the achromatic palette, grey contrast against AA, the accessibility structure,
and the script budget. Do not weaken a test to make a change pass.

Visually: 360 px, the 1100–1500 px band (where the air-guaranteed print is
at its smallest — the notes must clear it, and the print must still read
as the hero), and 1280 px+, both locales, keyboard focus, the portrait
swap with its annotations on hover and on tap, the carousel at every
breakpoint, `prefers-reduced-motion`, and a console with no errors.

### Two traps when verifying this project

Both of these have already produced confident, wrong diagnoses. Read them before
concluding that something is broken.

**Headless Chrome cannot photograph this layout directly.** It clamps the layout
viewport to a minimum of 500 px, so a `--window-size=390` capture renders at
500 px and crops — which looks exactly like a horizontal-overflow bug and is not
one. It also screenshots from the top of the document, so `#anchor` captures
come back blank. Measure overflow and slide heights in a real browser; use
headless only for tall full-page captures with the deck's `100svh` temporarily
pinned to a pixel height in `dist/`.

**In a backgrounded browser pane (`document.hidden === true`), CSS transitions
and `requestAnimationFrame` never advance.** Transitioned properties stay stuck
at their pre-transition values, so `getComputedStyle` reports `opacity: 1` and
`visibility: visible` on an element the stylesheet has already hidden, and the
carousel's rAF-scheduled sync never runs. To test anything transitioned, set
`element.style.transition = 'none'`, read the value, then restore it — that
isolates the cascade from the stalled animation clock.
