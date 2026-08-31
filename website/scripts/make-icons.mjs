#!/usr/bin/env node
/* Rebakes the raster favicons from assets/favicon.svg, so the three
   renditions can never drift apart: the SVG is the source of truth, and
   this script derives the other two whenever its geometry moves.

   - assets/favicon.ico: 16/32/48 classic BMP-in-ICO, dark caps on
     TRANSPARENCY — the mark carries no plate (client decision, 2026-08-29).
     Served at the site root for engines that ask for /favicon.ico by
     convention. The entries are BMP, not PNG-in-ICO, on purpose: this
     file's only audience is engines without SVG-favicon support (every
     modern engine takes the declared SVG), and those are exactly the
     parsers that predate or mishandle PNG entries — a PNG-in-ICO cut of
     this file left such tabs with no icon at all (2026-08-31). BMP entries
     are the format's original baseline that every ICO parser reads.
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
import { inflateSync } from "node:zlib";

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

/** The sips-scaled PNGs are RGBA8 non-interlaced; anything else means the
 *  pipeline upstream changed shape, so the decoder asserts instead of
 *  guessing. Filters per the PNG spec, four bytes per pixel. */
function decodePng(png) {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let width, height, ok = false;
  const idat = [];
  for (let off = 8; off < png.length; ) {
    const length = png.readUInt32BE(off);
    const type = png.toString("ascii", off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      ok = data[8] === 8 && data[9] === 6 && data[12] === 0;
    }
    if (type === "IDAT") idat.push(data);
    off += 12 + length;
  }
  if (!ok) throw new Error("expected 8-bit RGBA non-interlaced PNG");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = rgba.subarray(y * stride, (y + 1) * stride);
    const prev = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= 4 && prev ? prev[x - 4] : 0;
      let value = row[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`PNG filter ${filter}`);
      cur[x] = value & 0xff;
    }
  }
  return { width, height, rgba };
}

/** One classic ICO entry: BITMAPINFOHEADER, the pixels bottom-up in BGRA,
 *  then the 1-bit AND mask (transparent where alpha says so, rows padded
 *  to 32 bits) that pre-alpha renderers still consult. */
function bmpEntry({ width, height, rgba }) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8); // spec: XOR and AND planes together
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const xor = Buffer.alloc(width * height * 4);
  const maskStride = (((width + 7) >> 3) + 3) & ~3;
  const and = Buffer.alloc(maskStride * height);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    const dst = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgba[src + x * 4 + 3] < 128) {
        /* A masked pixel's XOR bytes must stay zero: a pre-alpha renderer
           draws (dest AND mask) XOR colour, so any ink left here XORs the
           background into coloured speckles along the mark's edge. */
        and[y * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
      } else {
        xor[dst + x * 4] = rgba[src + x * 4 + 2];
        xor[dst + x * 4 + 1] = rgba[src + x * 4 + 1];
        xor[dst + x * 4 + 2] = rgba[src + x * 4];
        xor[dst + x * 4 + 3] = rgba[src + x * 4 + 3];
      }
    }
  }
  return Buffer.concat([header, xor, and]);
}

/** Classic BMP-in-ICO: an ICONDIR, one 16-byte entry per image, then the
 *  DIBs. Deliberately NOT PNG-in-ICO — see the header comment: the engines
 *  that fall back to this file are the ones that cannot read PNG entries. */
function packIco(images) {
  const decoded = images.map(decodePng);
  const dibs = decoded.map(bmpEntry);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const [i, dib] of dibs.entries()) {
    const { width, height } = decoded[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(dib.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += dib.length;
  }
  return Buffer.concat([header, ...entries, ...dibs]);
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
