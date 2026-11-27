# ks-design.art logo master

The shared wordmark is an outlined SVG, based on the approved KS header,
with the user-requested hyphen: `ks-design.art` (2026-11-27).
The artwork is fixed; projects select the ink colour for their background.
The dot remains the same indigo-to-cyan gradient in both versions.

## Files

- `ks-design-art-master.svg` — canonical geometry and light-background ink.
- `ks-design-art-on-light.svg` — dark ink `#0b0b0c`, transparent background.
- `ks-design-art-on-dark.svg` — white ink `#ffffff`, transparent background.
- `preview.html` — both versions, enlarged and at native size.
- `manifest.json` — SHA-256 hashes for exact copies in consumer projects.
- `provenance.json` — font hashes, shaping, bounds and authoring details.
- `reference-metrics.json` — measured positions from the original live header.
- `lettering-metrics.json` — before/after positions for the approved hyphen.
- `verification/` — comparison captures and measured rendering differences.

The user approved this asset workflow and the six-project rollout on
2026-11-27. KS uses the exported assets in its header and social cards;
consumer projects copy the SVGs unchanged and record their hashes.

## Rendering contract

```html
<img src="ks-design-art-on-light.svg" alt="ks-design.art" width="121" height="20">
```

Use **121 × 20 CSS pixels** for the shared header logo, including on phones.
This canvas keeps the original 12.48px caps and 24.336px script scale. It is
wider than the original text layout box because it contains the script's
overhang and transparent safety space. The viewBox is `0 -17 121 20`.

Preserve the aspect ratio. Do not apply local resizing, filters, opacity,
rotation, CSS recolouring, path edits, or a new type treatment. Adapt the
surrounding header when space is tight. Use the dark-background asset on dark
surfaces. Keep `alt="ks-design.art"`; the SVG title provides the same name when
the file is opened directly. The files have no font, script or network dependency.

For presentations and print, proportional enlargement is allowed. The 4×
display on `preview.html` is a proof, not a different header size.

## Exporting and copying

Edit the master, then run from the repository root:

```sh
node brand/export-variants.mjs
```

The exporter changes exactly one ink attribute. All paths, dimensions,
gradient stops and dot geometry remain byte-for-byte identical. Copy the
resulting files as-is into each project; use the manifest hashes to detect
drift. Never redraw the letters independently in a consumer project.

`outline-reference.py` documents the original outline extraction. It is an
offline authoring tool, not a site-build dependency. It needs FontTools with
WOFF2 support and the `hb-shape` command. It reads the checked-in metrics and
the existing font files. The script draws Manrope's variable outlines at
700 without a save/reload rounding step and shapes `art` with HarfBuzz,
retaining the contextual `t` (glyph 132). A measured 0.4px optical offset
preserves the painted position of Chrome's transformed script run.

The source families are Manrope and Caveat, already licensed in
[`OFL-Manrope.txt`](../website/assets/fonts/OFL-Manrope.txt) and
[`OFL-Caveat.txt`](../website/assets/fonts/OFL-Caveat.txt). No new font is used.

## Verification result

The two SVG variants have identical geometry and differ only in ink colour.
The hyphen uses the same Manrope 700 outlines and tracking. The DESIGN
letters, dot and script move right to accommodate it without shrinking the
letters. The reference font files, weights, contextual glyph, scale, spacing, tilt
and gradient were retained. Nothing is clipped by the viewBox.

Text glyphs and SVG paths use different browser rasterisation, so comparison
with the reference typography amended to `ks-design` is **not a zero-pixel bitmap match**. At 8×,
95% of the thresholded outline comparisons are within 0.708 CSS px; the
largest measured contour distance is 0.875 CSS px. These figures describe
the updated `ks-design` text comparison, not the earlier unhyphenated proof.
The script geometry retains the original master's optical position, shifted
right by 2.75px with the dot after the hyphen insertion. Native 1× and 2× captures
are included, rather than claiming that edge smoothing is identical.
See `verification/comparison.json` and `verification/contour-overlay-8x.png`.

Once all projects use the same SVGs at the same size, differences caused by
font versions, shaping, missing fonts, or independently rounded outlines are
removed. Browser/OS rasterisation can still differ across environments.
