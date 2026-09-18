#!/usr/bin/env node
/* Delivery speed of the built site, compared with a recorded baseline.

   There are no byte budgets any more (retired 2026-09-17: a ceiling that is
   raised every time it is hit guards nothing, and one that is not raised
   forbids the change that hit it). What is guarded instead is the thing a
   visitor feels — how long the first paint and the full page take to arrive
   — measured against the last accepted number, so a change that makes the
   page slower is named in the run that introduced it.

   The number is a model, not a stopwatch: every request the page makes at
   load is found in the built markup and stylesheet, the bytes the wire
   carries are counted (gzip for text, as the edge sends it, raw for the
   rest; a responsive image by the candidate a modelled phone would pick),
   and the load is played over one modelled connection — a fixed round trip
   and a fixed downlink, the "slow 4G" that phone gets on a bad day.
   A model has what a stopwatch on a laptop cannot have: two runs of the same
   build agree to the millisecond, so a regression is a regression and not
   noise. `--url <origin>` runs the same requests against a live site and
   prints real timings beside the model, for reading after a deploy; those
   are never compared with the baseline.

   Usage:
     node scripts/check-delivery-speed.mjs            compare with the baseline
     node scripts/check-delivery-speed.mjs --update   accept the current build as the baseline
     node scripts/check-delivery-speed.mjs --url https://ks-design.art
                                                      time the live site as well */

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { extname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { loadConfig, resolveWithin } from "./config.mjs";

/* Text the edge compresses before it leaves; everything else travels as is. */
const COMPRESSED = new Set([".html", ".css", ".js", ".mjs", ".svg", ".xml", ".txt", ".json", ".ico"]);

/* DNS, TCP and TLS before the first byte of the first request can be asked
   for: three round trips is the usual cost of a cold HTTPS connection. */
const HANDSHAKE_RTTS = 3;

function filesUnder(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Deployable output contains a symlink: ${path}`);
    if (stat.isDirectory()) files.push(...filesUnder(path));
    else if (stat.isFile()) files.push(path);
  }
  return files.sort();
}

/** Bytes on the wire for one response. Each file is its own response, so
 *  each is its own gzip stream — concatenating first would let later files
 *  reuse earlier dictionaries and undercount. */
export function wireBytes(path, buffer) {
  return COMPRESSED.has(extname(path).toLowerCase())
    ? gzipSync(buffer, { level: 6 }).length
    : buffer.length;
}

/** `/assets/x.css?v=abc` → `assets/x.css`: the file the URL names in dist/. */
function toOutputPath(url) {
  const bare = url.split(/[?#]/)[0];
  if (/^[a-z]+:/i.test(bare) || bare.startsWith("//")) return null;
  return posix.normalize(bare.replace(/^\//, ""));
}

const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, "i"))?.[1];

/* --- the phone the load is modelled on --------------------------------------

   A responsive image is not one request but a choice, and the browser makes
   it from the viewport, the pixel ratio and the `sizes` attribute. Taking the
   first `srcset` candidate would charge the 520w portrait to a phone that
   asks for the 776w one (Codex review, 2026-09-18), and the larger file could
   then grow without moving the number. So the model has a viewport, and the
   candidate is chosen the way the browser chooses it. */

/** A CSS length in `sizes`, evaluated to CSS pixels for the viewport:
 *  numbers with px, vw, vh/svh, rem and em, inside calc(), min(), max() and
 *  clamp(). Written as a small parser rather than an eval — the strings are
 *  our own, but nothing here should be able to run anything. */
export function cssLength(expression, viewport) {
  const src = expression.trim();
  let at = 0;
  const peek = () => src[at];
  const skip = () => { while (/\s/.test(src[at] ?? "")) at += 1; };
  const fail = () => { throw new Error(`Cannot evaluate sizes length "${expression}"`); };

  function sum() {
    let value = product();
    for (;;) {
      skip();
      if (peek() === "+") { at += 1; value += product(); }
      else if (peek() === "-") { at += 1; value -= product(); }
      else return value;
    }
  }
  function product() {
    let value = unary();
    for (;;) {
      skip();
      if (peek() === "*") { at += 1; value *= unary(); }
      else if (peek() === "/") { at += 1; value /= unary(); }
      else return value;
    }
  }
  function unary() {
    skip();
    if (peek() === "-") { at += 1; return -unary(); }
    if (peek() === "(") { at += 1; const value = sum(); skip(); if (peek() !== ")") fail(); at += 1; return value; }
    const call = src.slice(at).match(/^(calc|min|max|clamp)\(/i);
    if (call) {
      at += call[0].length;
      const args = [sum()];
      for (;;) {
        skip();
        if (peek() === ",") { at += 1; args.push(sum()); }
        else if (peek() === ")") { at += 1; break; }
        else fail();
      }
      switch (call[1].toLowerCase()) {
        case "calc": if (args.length !== 1) fail(); return args[0];
        case "min": return Math.min(...args);
        case "max": return Math.max(...args);
        default: if (args.length !== 3) fail(); return Math.min(Math.max(args[1], args[0]), args[2]);
      }
    }
    const number = src.slice(at).match(/^(\d*\.?\d+)(px|vw|vh|svh|dvh|lvh|rem|em)?/i);
    if (!number) fail();
    at += number[0].length;
    const value = Number(number[1]);
    switch ((number[2] ?? "px").toLowerCase()) {
      case "px": return value;
      case "vw": return value * viewport.cssWidth / 100;
      case "rem": case "em": return value * 16;
      default: return value * viewport.cssHeight / 100;
    }
  }
  const value = sum();
  skip();
  if (at !== src.length) fail();
  return value;
}

/** `(min-width: 900px) and (max-width: 1099px)` against the viewport; the
 *  only media features `sizes` uses here. Anything else is taken as false,
 *  which falls through to the next size. */
function mediaMatches(condition, viewport) {
  const parts = condition.split(/\s+and\s+/i);
  return parts.every((part) => {
    const feature = part.match(/^\(\s*(min|max)-width\s*:\s*([^)]+)\)$/i);
    if (!feature) return false;
    const limit = cssLength(feature[2], viewport);
    return feature[1].toLowerCase() === "min" ? viewport.cssWidth >= limit : viewport.cssWidth <= limit;
  });
}

/** Comma-separated entries, but not the commas inside `min(a, b)`. */
function topLevelEntries(list) {
  const entries = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= list.length; i += 1) {
    const ch = list[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if ((ch === "," && depth === 0) || i === list.length) {
      entries.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  return entries.filter(Boolean);
}

/** The slot width `sizes` gives this viewport, in CSS pixels: the first
 *  entry whose condition holds, else the bare fallback, else 100vw. */
export function slotWidth(sizes, viewport) {
  for (const entry of topLevelEntries(sizes ?? "")) {
    const conditional = entry.match(/^(\(.*\))\s+(.+)$/);
    if (!conditional) return cssLength(entry, viewport);
    if (mediaMatches(conditional[1], viewport)) return cssLength(conditional[2], viewport);
  }
  return viewport.cssWidth;
}

/** The candidate the browser fetches: the smallest whose width covers the
 *  slot at the device pixel ratio, or the largest when none does. A srcset
 *  without width descriptors is taken by its first entry. */
export function pickCandidate(srcset, sizes, viewport) {
  const candidates = topLevelEntries(srcset).map((part) => {
    const [url, descriptor] = part.split(/\s+/);
    return { url, width: descriptor?.endsWith("w") ? Number(descriptor.slice(0, -1)) : null };
  });
  if (candidates.some((candidate) => candidate.width === null)) return candidates[0].url;
  const needed = slotWidth(sizes, viewport) * viewport.dpr;
  const sorted = candidates.sort((a, b) => a.width - b.width);
  return (sorted.find((candidate) => candidate.width >= needed) ?? sorted[sorted.length - 1]).url;
}

/** Every request a browser makes while loading this page, in two rings:
 *  what the first paint waits for (the document, its stylesheets, whatever
 *  it preloads, and the images it asks for eagerly) and what the full load
 *  adds (the deferred script and the fonts the stylesheet declares for the
 *  text on the page). Lazy images are left out — they are not requested
 *  until scrolled to, so they cost the visitor nothing at load. */
export function pageRequests(html, resolveCss, viewport) {
  const firstPaint = new Set();
  const fullLoad = new Set();
  const add = (set, url) => {
    const path = url && toOutputPath(url);
    if (path) set.add(path);
  };

  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attribute(tag, "rel") ?? "").toLowerCase();
    if (rel === "stylesheet" || rel === "preload" || rel === "modulepreload") add(firstPaint, attribute(tag, "href"));
  }
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) add(fullLoad, attribute(tag, "src"));

  /* A `<picture>` is one request: the browser takes the first source it can
     show and, from its srcset, the candidate that covers the slot `sizes`
     gives the modelled phone. */
  const imageRequest = (tag, srcset) => {
    if (!srcset) return attribute(tag, "src");
    return pickCandidate(srcset, attribute(tag, "sizes"), viewport);
  };
  const pictures = new Set();
  for (const [block] of html.matchAll(/<picture\b[\s\S]*?<\/picture>/gi)) {
    const img = block.match(/<img\b[^>]*>/i)?.[0] ?? "";
    pictures.add(img);
    if (/\sloading=["']lazy["']/i.test(img)) continue;
    const source = block.match(/<source\b[^>]*>/i)?.[0];
    add(firstPaint, source ? imageRequest(source, attribute(source, "srcset")) : imageRequest(img, attribute(img, "srcset")));
  }
  for (const [img] of html.matchAll(/<img\b[^>]*>/gi)) {
    if (pictures.has(img) || /\sloading=["']lazy["']/i.test(img)) continue;
    add(firstPaint, imageRequest(img, attribute(img, "srcset")));
  }

  const text = new Set(
    [...html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ")].map((ch) => ch.codePointAt(0))
  );
  for (const path of firstPaint) {
    if (extname(path).toLowerCase() !== ".css") continue;
    const css = resolveCss(path);
    if (css === null) continue;
    for (const [face] of css.matchAll(/@font-face\s*\{[^}]*\}/gi)) {
      const url = face.match(/url\(\s*["']?([^"')]+)["']?\s*\)/i)?.[1];
      if (!url) continue;
      const range = face.match(/unicode-range\s*:\s*([^;}]+)/i)?.[1];
      if (!range || rangeCovers(range, text)) add(fullLoad, url);
    }
  }

  for (const path of firstPaint) fullLoad.delete(path);
  return { firstPaint: [...firstPaint].sort(), fullLoad: [...fullLoad].sort() };
}

/** Whether a `unicode-range` list reaches any code point on the page: a
 *  face that covers none of its text is never fetched. */
function rangeCovers(range, codePoints) {
  for (const token of range.split(",").map((part) => part.trim()).filter(Boolean)) {
    const wildcard = token.match(/^U\+([0-9A-F]*)\?+$/i);
    const span = token.match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i);
    let from;
    let to;
    if (wildcard) {
      const digits = token.length - 2 - wildcard[1].length;
      from = parseInt(`${wildcard[1]}${"0".repeat(digits)}`, 16);
      to = parseInt(`${wildcard[1]}${"F".repeat(digits)}`, 16);
    } else if (span) {
      from = parseInt(span[1], 16);
      to = span[2] ? parseInt(span[2], 16) : from;
    } else {
      continue;
    }
    for (const point of codePoints) if (point >= from && point <= to) return true;
  }
  return false;
}

/** The modelled load: the handshake, the document alone, then everything
 *  it needs in parallel over the same connection — one more round trip to
 *  ask, and the bytes sharing one downlink. */
function modelMs(connection, documentBytes, dependentBytes) {
  const perByte = 8 / connection.downloadKbps; // ms per byte: 8 bits over kbit/s = bit/ms
  const documentMs = connection.rttMs + documentBytes * perByte;
  const dependentsMs = dependentBytes === 0 ? 0 : connection.rttMs + dependentBytes * perByte;
  return Math.round(HANDSHAKE_RTTS * connection.rttMs + documentMs + dependentsMs);
}

export function measure(root) {
  const config = loadConfig(root);
  const { performance } = config;
  const output = resolveWithin(root, performance.outputDirectory, "performance.outputDirectory");
  const files = filesUnder(output);
  if (files.length === 0) throw new Error(`No deployable files found in ${performance.outputDirectory}`);

  const failures = [];
  const allowed = new Set(performance.allowedExtensions);
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (!allowed.has(extension)) {
      failures.push(`Unexpected deployable file type ${extension || "(none)"}: ${relative(output, file)}`);
    }
  }

  const bytesOf = new Map();
  const read = (path) => {
    const file = resolveWithin(output, path, `request ${path}`);
    if (!existsSync(file)) return null;
    if (!bytesOf.has(path)) bytesOf.set(path, wireBytes(path, readFileSync(file)));
    return bytesOf.get(path);
  };

  const pages = {};
  for (const page of performance.entryPages) {
    const html = readFileSync(resolveWithin(output, page, `entry page ${page}`), "utf8");
    const requests = pageRequests(html, (path) => {
      const file = resolveWithin(output, path, `stylesheet ${path}`);
      return existsSync(file) ? readFileSync(file, "utf8") : null;
    }, performance.delivery.viewport);
    const tally = (paths) => {
      const bytes = {};
      for (const path of paths) {
        const size = read(path);
        if (size === null) failures.push(`${page} requests ${path}, which the build did not produce`);
        else bytes[path] = size;
      }
      return bytes;
    };
    const documentBytes = read(page);
    const firstPaint = tally(requests.firstPaint);
    const fullLoad = tally(requests.fullLoad);
    const sum = (bytes) => Object.values(bytes).reduce((total, size) => total + size, 0);
    pages[page] = {
      firstPaint: {
        ms: modelMs(performance.delivery.connection, documentBytes, sum(firstPaint)),
        bytes: { [page]: documentBytes, ...firstPaint }
      },
      fullLoad: {
        ms: modelMs(performance.delivery.connection, documentBytes, sum(firstPaint) + sum(fullLoad)),
        bytes: { [page]: documentBytes, ...firstPaint, ...fullLoad }
      }
    };
  }

  return { config, failures, pages, output };
}

const RINGS = { firstPaint: "first paint", fullLoad: "full load" };
const formatBytes = (bytes) => `${bytes.toLocaleString("en-US")} B`;
const sum = (bytes) => Object.values(bytes).reduce((total, size) => total + size, 0);

/** Names the requests that grew (or appeared) between two rings, largest
 *  first, so a slower number points at the file that made it slower. */
function growth(before, after) {
  const lines = [];
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const delta = (after[path] ?? 0) - (before[path] ?? 0);
    if (delta > 0) lines.push([delta, path]);
  }
  return lines
    .sort((a, b) => b[0] - a[0])
    .slice(0, 5)
    .map(([delta, path]) => `${path} +${formatBytes(delta)}`)
    .join(", ");
}

export function compare(current, baseline, tolerance) {
  const failures = [];
  const notes = [];
  for (const [page, rings] of Object.entries(current.pages)) {
    const recorded = baseline.pages?.[page];
    if (!recorded) {
      failures.push(`${page} has no recorded baseline; run check-delivery-speed.mjs --update to accept it`);
      continue;
    }
    for (const [ring, label] of Object.entries(RINGS)) {
      const now = rings[ring];
      const then = recorded[ring];
      if (!then) {
        failures.push(`${page} ${label} has no recorded baseline; run check-delivery-speed.mjs --update to accept it`);
        continue;
      }
      const change = now.ms / then.ms - 1;
      const percent = `${Math.abs(change * 100).toFixed(1)}%`;
      if (change > tolerance) {
        failures.push(
          `${page} ${label} ${now.ms} ms is ${percent} slower than the ${then.ms} ms baseline` +
            ` (${growth(then.bytes, now.bytes) || "same requests, larger responses"}).` +
            " Make it lighter, or accept the new number with --update and say why in the commit."
        );
      } else if (change < -tolerance) {
        notes.push(`${page} ${label} ${now.ms} ms is ${percent} faster than the ${then.ms} ms baseline — run --update to keep the gain.`);
      }
    }
  }
  return { failures, notes };
}

/** Real timings for the same requests against a live origin: time to the
 *  document's first byte and to its last, then the wall time of the
 *  dependent requests in parallel. Reported, never compared — a network
 *  measurement varies with the network. */
async function timeLive(origin, pages) {
  const base = origin.replace(/\/$/, "");
  const rows = [];
  for (const [page, rings] of Object.entries(pages)) {
    const url = `${base}/${page.replace(/(^|\/)index\.html$/, "$1")}`;
    const started = performance.now();
    const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
    const firstByte = performance.now() - started;
    await response.arrayBuffer();
    const documentMs = performance.now() - started;
    if (!response.ok) {
      rows.push(`${url}: HTTP ${response.status}`);
      continue;
    }
    const time = async (paths) => {
      const at = performance.now();
      await Promise.all(paths.map((path) => fetch(`${base}/${path}`).then((r) => r.arrayBuffer())));
      return Math.round(performance.now() - at);
    };
    const firstPaint = await time(Object.keys(rings.firstPaint.bytes).filter((path) => path !== page));
    const fullLoad = await time(Object.keys(rings.fullLoad.bytes).filter((path) => path !== page));
    rows.push(
      `${url}: first byte ${Math.round(firstByte)} ms, document ${Math.round(documentMs)} ms,` +
        ` first-paint requests ${firstPaint} ms, full-load requests ${fullLoad} ms (${response.headers.get("cf-cache-status") ?? "no edge"})`
    );
  }
  return rows;
}

function report(current) {
  const lines = [];
  for (const [page, rings] of Object.entries(current.pages)) {
    for (const [ring, label] of Object.entries(RINGS)) {
      const { ms, bytes } = rings[ring];
      lines.push(`  ${page.padEnd(16)} ${label.padEnd(11)} ${String(ms).padStart(5)} ms  ${formatBytes(sum(bytes)).padStart(11)} over ${Object.keys(bytes).length} requests`);
    }
  }
  return lines.join("\n");
}

async function main() {
  const rootIndex = process.argv.indexOf("--root");
  const root = resolve(rootIndex === -1 ? import.meta.dirname : process.argv[rootIndex + 1], rootIndex === -1 ? ".." : ".");
  const update = process.argv.includes("--update");
  const urlIndex = process.argv.indexOf("--url");
  const origin = urlIndex === -1 ? null : process.argv[urlIndex + 1];

  const current = measure(root);
  const { delivery } = current.config.performance;
  const { connection, viewport } = delivery;
  console.log(
    `Delivery to a ${viewport.cssWidth}×${viewport.cssHeight} @${viewport.dpr}x phone` +
      ` over ${connection.downloadKbps} kbps at ${connection.rttMs} ms round trips:\n${report(current)}`
  );

  const baselinePath = resolveWithin(root, delivery.baseline, "performance.delivery.baseline");
  if (update) {
    const record = { connection, viewport, pages: current.pages };
    writeFileSync(baselinePath, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`Recorded as the baseline in ${delivery.baseline}.`);
  } else if (!existsSync(baselinePath)) {
    current.failures.push(`No baseline at ${delivery.baseline}; run check-delivery-speed.mjs --update to record this build as the one to beat`);
  } else {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    if (JSON.stringify(baseline.connection) !== JSON.stringify(connection) ||
        JSON.stringify(baseline.viewport) !== JSON.stringify(viewport)) {
      current.failures.push("The baseline was recorded for a different connection or phone; run check-delivery-speed.mjs --update to re-record it");
    } else {
      const { failures, notes } = compare(current, baseline, delivery.tolerance);
      current.failures.push(...failures);
      for (const note of notes) console.log(`  note: ${note}`);
    }
  }

  if (origin) {
    console.log(`Live, from here to ${origin}:`);
    for (const row of await timeLive(origin, current.pages)) console.log(`  ${row}`);
  }

  if (current.failures.length) {
    console.error(current.failures.map((failure) => `- ${failure}`).join("\n"));
    process.exit(1);
  }
}

/* Run only when invoked directly — the tests import the model above. The
   real path on both sides, because a temp directory on macOS is reached
   through a symlink and the two spellings would never match. */
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
