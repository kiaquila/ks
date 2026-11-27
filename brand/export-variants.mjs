#!/usr/bin/env node
// The master owns all geometry. Exports differ only in the ink colour.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = import.meta.dirname;
const source = await readFile(join(root, "ks-design-art-master.svg"), "utf8");
const ink = '<g id="ks-logo-ink" fill="#0b0b0c">';
if (source.split(ink).length !== 2) throw new Error("Master ink group not found exactly once");
if (/<(?:text|style|script|image|foreignObject)\b|(?:href|font-family|currentColor)=?/i.test(source)) {
  throw new Error("Master must contain self-contained outlines, without fonts or external content");
}
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const dimensions = source.match(/^<svg[^>]*width="(\d+)" height="(\d+)"/);
if (!dimensions) throw new Error("Master dimensions missing");
const variants = {};
for (const [background, colour] of [["light", "#0b0b0c"], ["dark", "#ffffff"]]) {
  const name = `ks-design-art-on-${background}.svg`;
  const svg = source.replace(ink, `<g id="ks-logo-ink" fill="${colour}">`);
  await writeFile(join(root, name), svg);
  variants[name] = { ink: colour, sha256: sha256(svg), bytes: Buffer.byteLength(svg) };
}
await writeFile(join(root, "manifest.json"), JSON.stringify({
  master: "ks-design-art-master.svg",
  masterSha256: sha256(source),
  nativeSize: { width: Number(dimensions[1]), height: Number(dimensions[2]) },
  variants
}, null, 2) + "\n");
console.log("Exported light and dark SVGs from the same master.");
