#!/usr/bin/env node
/* Rebakes the raster favicons from assets/favicon.svg, so the three
   renditions can never drift apart: the SVG is the source of truth, and
   this script derives the other two whenever its geometry moves.

   - assets/favicon.ico: 16/32/48 PNG-in-ICO, dark caps on TRANSPARENCY —
     the mark carries no plate (client decision, 2026-08-29). Served at the
     site root for engines that ask for /favicon.ico by convention.
   - assets/apple-touch-icon.png: 512x512 on a white plate, because iOS
     composes home-screen icons on arbitrary wallpapers and does not honour
     transparency.

   Like make-og.mjs, the renderer is headless Chrome, so the icons carry
   exactly the pixels a browser would draw — with two traps pinned here:
   headless inherits the OS dark scheme, so the text fill is forced with
   !important or the caps silently flip white; and Chrome clamps its window
   to 500px, so everything renders at 512 and the small sizes are scaled
   down with sips (macOS-only, like the documented screenshot recipes). */

import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SIZES = [16, 32, 48];

const source = await readFile(join(root, "assets", "favicon.svg"), "utf8");

/** The raster variants must not follow the renderer's theme, so the dark
 *  media block goes and the light fill is pinned. Both edits assert, so a
 *  reshaped favicon.svg fails loudly here instead of baking a wrong icon. */
function flatten(svg) {
  const withoutDark = svg.replace(
    /@media \(prefers-color-scheme: dark\) \{[^}]*\{[^}]*\}\s*\}/,
    ""
  );
  if (withoutDark === svg) throw new Error("favicon.svg: dark block not found");
  const pinned = withoutDark.replace("fill: #0b0b0c;", "fill: #0b0b0c !important;");
  if (pinned === withoutDark) throw new Error("favicon.svg: light fill not found");
  return pinned;
}

function plated(svg) {
  const withPlate = svg.replace(
    "<text",
    '<rect width="64" height="64" fill="#ffffff"/>\n  <text'
  );
  if (withPlate === svg) throw new Error("favicon.svg: text element not found");
  return withPlate;
}

const page = (svg) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: 512px; height: 512px; }
</style></head><body>${svg}</body></html>
`;

function shoot(htmlPath, outPath, { transparent }) {
  execFileSync(CHROME, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    ...(transparent ? ["--default-background-color=00000000"] : []),
    "--window-size=512,512",
    `--screenshot=${outPath}`,
    `file://${htmlPath}`
  ]);
}

/** PNG-in-ICO: an ICONDIR, one 16-byte entry per image, then the PNG blobs
 *  verbatim — valid in every engine that still asks for /favicon.ico. */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const png of images) {
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images]);
}

const work = await mkdtemp(join(tmpdir(), "ks-icons-"));
try {
  const flatHtml = join(work, "flat.html");
  const plateHtml = join(work, "plate.html");
  await writeFile(flatHtml, page(flatten(source)), "utf8");
  await writeFile(plateHtml, page(plated(flatten(source))), "utf8");

  const flat512 = join(work, "flat-512.png");
  const plate512 = join(work, "plate-512.png");
  shoot(flatHtml, flat512, { transparent: true });
  shoot(plateHtml, plate512, { transparent: false });

  const pngs = [];
  for (const size of SIZES) {
    const out = join(work, `flat-${size}.png`);
    execFileSync("sips", ["-z", String(size), String(size), flat512, "--out", out], {
      stdio: "ignore"
    });
    pngs.push(await readFile(out));
  }

  await writeFile(join(root, "assets", "favicon.ico"), packIco(pngs));
  await writeFile(
    join(root, "assets", "apple-touch-icon.png"),
    await readFile(plate512)
  );
  console.log(
    `Rebaked favicon.ico (${SIZES.join("/")}) and apple-touch-icon.png from favicon.svg.`
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
