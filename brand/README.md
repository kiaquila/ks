# ks design.art logo master

The shared wordmark is an outlined SVG, based on the approved KS header,
with the original space: `ks design.art` (user preference, 2026-11-27).
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
- `lettering-metrics.json` — original and hyphen-trial positions; `active: before` restores the space.
- `verification/` — comparison captures and measured rendering differences.

The user approved this asset workflow and the six-project rollout on
2026-11-27. KS uses the exported assets in its header and social cards;
consumer projects copy the SVGs unchanged and record their hashes.

## Rendering contract

```html
<img src="ks-design-art-on-light.svg" alt="ks design.art" width="118" height="20">
```

Use **118 × 20 CSS pixels** for the shared header logo, including on phones.
This canvas keeps the original 12.48px caps and 24.336px script scale. It is
wider than the original text layout box because it contains the script's
overhang and transparent safety space. The viewBox is `0 -17 118 20`.

Preserve the aspect ratio. Do not apply local resizing, filters, opacity,
rotation, CSS recolouring, path edits, or a new type treatment. Adapt the
surrounding header when space is tight. Use the dark-background asset on dark
surfaces. Keep `alt="ks design.art"`; the SVG title provides the same name when
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

The original space between KS and DESIGN is restored from the retained
measurements, without shrinking or redrawing the letters. The two variants
have identical geometry and differ only in ink colour. The dot, handwritten
contextual t, scale, spacing and -5° tilt retain the original master positions.
The domain URLs and asset filenames keep their hyphens.

The current `verification/` captures compare the restored artwork with the
original unhyphenated reference. Browser text and SVG paths use different
rasterisation; a zero-pixel match against live text is not claimed. Consumer
SVGs are copied byte-for-byte and checked against the manifest hashes.

At 8×, 95% of the thresholded contour comparisons are within 0.125 CSS px;
the largest measured distance is 0.280 CSS px. Both colour variants have
zero alpha-mask differences at 1×, 2× and 8×. See `verification/comparison.json`
and `verification/variant-checks.json`.
