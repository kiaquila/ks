import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { cssLength, pageRequests, pickCandidate, slotWidth, wireBytes } from "../scripts/check-delivery-speed.mjs";

const templateRoot = resolve(import.meta.dirname, "..");

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}

function run(root, script) {
  return spawnSync(process.execPath, [join(root, "scripts", script), "--root", root], {
    cwd: root,
    encoding: "utf8"
  });
}

function configure(root) {
  const configPath = join(root, "web-design.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.projectSlug = "demo-project";
  config.projectChecks = [{
    name: "real project smoke",
    command: ["node", "-e", "process.exit(0)"]
  }];
  /* KS builds into website/dist, but the fixture exercises the harness against
     its own synthetic dist/ so these tests never depend on a real build. */
  config.performance.outputDirectory = "dist";
  config.performance.entryPages = ["index.html"];
  config.performance.delivery.baseline = "delivery-baseline.json";
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const owners = readFileSync(join(root, ".github/CODEOWNERS"), "utf8")
    .replaceAll("replace-with-owner", "owner");
  writeFileSync(join(root, ".github/CODEOWNERS"), owners);
}

function deconfigure(root) {
  /* KS is already a configured project; restore the template placeholders so
     this fixture still exercises the untouched-reference rejection. */
  const configPath = join(root, "web-design.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.projectSlug = "replace-me";
  config.projectChecks = [];
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const owners = readFileSync(join(root, ".github/CODEOWNERS"), "utf8")
    .replaceAll("@kiaquila", "@replace-with-owner");
  writeFileSync(join(root, ".github/CODEOWNERS"), owners);
}

function makeFixture({ configured = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "web-design-template-"));
  cpSync(templateRoot, root, { recursive: true });
  /* In a linked worktree `.git` is a file pointing at the real repository,
     and a copy of it still points there: the fixture's `git add -A` below
     then staged the demo configuration into the worktree's own index. The
     fixture gets a repository of its own. */
  rmSync(join(root, ".git"), { recursive: true, force: true });
  if (configured) configure(root); else deconfigure(root);
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  assert.equal(git.status, 0, git.stderr);
  const add = spawnSync("git", ["add", "-A"], { cwd: root, encoding: "utf8" });
  assert.equal(add.status, 0, add.stderr);
  write(root, "dist/index.html", "<!doctype html><title>Demo</title><script src=\"/app.js\" defer></script>\n");
  write(root, "dist/app.js", "document.documentElement.dataset.ready = 'true';\n");
  return root;
}

function recordBaseline(root) {
  const result = spawnSync(process.execPath, [join(root, "scripts/check-delivery-speed.mjs"), "--root", root, "--update"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(readFileSync(join(root, "delivery-baseline.json"), "utf8"));
}

function withFixture(options, callback) {
  const root = makeFixture(options);
  try {
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the untouched reference requires deliberate project configuration", () => {
  withFixture({ configured: false }, (root) => {
    const result = run(root, "check-repository.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /projectSlug must be replaced/);
    assert.match(result.stderr, /projectChecks must contain at least one real/);
    assert.match(result.stderr, /CODEOWNERS placeholder/);
  });
});

test("configured repository, project commands, and delivery check pass", () => {
  withFixture({}, (root) => {
    recordBaseline(root);
    for (const script of [
      "check-repository.mjs",
      "run-project-checks.mjs",
      "check-delivery-speed.mjs"
    ]) {
      const result = run(root, script);
      assert.equal(result.status, 0, `${script}\n${result.stderr}`);
    }
  });
});

test("project commands are executed directly and failures propagate", () => {
  withFixture({}, (root) => {
    const path = join(root, "web-design.config.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    config.projectChecks = [{ name: "failing test", command: ["node", "-e", "process.exit(7)"] }];
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
    const result = run(root, "run-project-checks.mjs");
    assert.equal(result.status, 7);
  });
});

test("a build with no recorded baseline says how to record one", () => {
  withFixture({}, (root) => {
    const result = run(root, "check-delivery-speed.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No baseline at delivery-baseline\.json; run check-delivery-speed\.mjs --update/);
  });
});

test("a slower first paint than the baseline fails and names what grew", () => {
  withFixture({}, (root) => {
    const baseline = recordBaseline(root);
    /* Random bytes do not compress, so 47 KiB of them is 47 KiB on the wire:
       at 1600 kbps that is 240 ms on a first paint of a few hundred. */
    write(root, "dist/index.html", randomBytes(47 * 1024));
    const result = run(root, "check-delivery-speed.mjs");
    assert.equal(result.status, 1);
    const [, ms] = result.stderr.match(/index\.html first paint (\d+) ms is [\d.]+% slower than the (\d+) ms baseline/) ?? [];
    assert.ok(ms, result.stderr);
    assert.ok(Number(ms) > baseline.pages["index.html"].firstPaint.ms);
    assert.match(result.stderr, /\(index\.html \+[\d,]+ B\)/);
    assert.match(result.stderr, /--update/);
  });
});

test("growth inside the tolerance passes, and a gain is offered as the new baseline", () => {
  withFixture({}, (root) => {
    recordBaseline(root);
    /* Well under 3% of the modelled first paint (a few hundred bytes of
       compressible markup is a millisecond or two). */
    write(root, "dist/index.html", "<!doctype html><title>Demo</title><script src=\"/app.js\" defer></script><p>hello</p>\n");
    let result = run(root, "check-delivery-speed.mjs");
    assert.equal(result.status, 0, result.stderr);

    write(root, "dist/index.html", randomBytes(20 * 1024));
    recordBaseline(root);
    write(root, "dist/index.html", "<!doctype html><title>Demo</title>\n");
    result = run(root, "check-delivery-speed.mjs");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /faster than the .* baseline — run --update/);
  });
});

test("every request is counted as its own gzip response", () => {
  /* One shared stream would let a later file reuse an earlier one's
     dictionary, so two copies of the same text would look like one. */
  const script = "document.documentElement.dataset.ready = 'true';\n".repeat(400);
  const markup = `<!doctype html><title>Demo</title><script src="/app.js" defer></script><script>${script}</script>\n`;
  const own = wireBytes("index.html", Buffer.from(markup)) + wireBytes("app.js", Buffer.from(script));
  const shared = gzipSync(Buffer.concat([Buffer.from(markup), Buffer.from(script)]), { level: 6 }).length;
  assert.ok(shared < own);
  withFixture({}, (root) => {
    write(root, "dist/index.html", markup);
    write(root, "dist/app.js", script);
    const baseline = recordBaseline(root);
    const counted = Object.values(baseline.pages["index.html"].fullLoad.bytes).reduce((total, size) => total + size, 0);
    assert.equal(counted, own);
  });
});

test("the page's requests are read from its markup and stylesheet", () => {
  const html = `<!doctype html>
    <link rel="preload" as="font" href="/assets/fonts/latin.woff2" crossorigin>
    <link rel="stylesheet" href="/assets/styles.css?v=abc123">
    <link rel="icon" href="/assets/favicon.svg?v=6">
    <picture><source srcset="/assets/hero-520.webp 520w, /assets/hero-1040.webp 1040w"><img src="/assets/hero-520.jpg" alt="" fetchpriority="high"></picture>
    <picture><source srcset="/assets/card-800.webp 800w"><img src="/assets/card-800.jpg" alt="" loading="lazy"></picture>
    <img src="/assets/logo.svg" alt=""><img src="/assets/later.png" alt="" loading="lazy">
    <p>Plain text</p>
    <script src="/assets/site.js?v=def456" defer></script>`;
  const css = `@font-face { font-family: A; src: url("/assets/fonts/latin.woff2"); unicode-range: U+0000-00FF; }
    @font-face { font-family: A; src: url("/assets/fonts/cyrillic.woff2"); unicode-range: U+0400-045F; }
    @font-face { font-family: B; src: url("/assets/fonts/hand.woff2"); unicode-range: U+00??; }
    @font-face { font-family: C; src: url("/assets/fonts/any.woff2"); }`;
  const phone = { cssWidth: 390, cssHeight: 844, dpr: 2 };
  const requests = pageRequests(html, (path) => (path === "assets/styles.css" ? css : null), phone);
  /* The eager picture has no sizes, so its slot is the viewport: 390 × 2 =
     780 device pixels, which the 1040w candidate is the first to cover. */
  assert.deepEqual(requests.firstPaint, [
    "assets/fonts/latin.woff2",
    "assets/hero-1040.webp",
    "assets/logo.svg",
    "assets/styles.css"
  ]);
  /* The Cyrillic face covers no text on the page, so a browser never asks
     for it; the preloaded face is already in the first ring. */
  assert.deepEqual(requests.fullLoad, ["assets/fonts/any.woff2", "assets/fonts/hand.woff2", "assets/site.js"]);
});

test("a responsive image is charged at the candidate the modelled phone fetches", () => {
  /* Taking the first srcset entry charged the 520w portrait to a phone that
     asks for the 776w one, so the larger file could grow unseen (Codex
     review, 2026-09-18). The browser's choice is reproduced instead: the
     slot `sizes` gives the viewport, times the pixel ratio, covered by the
     smallest candidate that can. */
  const phone = { cssWidth: 390, cssHeight: 844, dpr: 2 };
  const laptop = { cssWidth: 1280, cssHeight: 800, dpr: 1 };
  assert.equal(cssLength("min(84vw, 416px)", phone), 327.6);
  assert.equal(cssLength("calc(42vw - 220px)", laptop), 317.6);
  assert.equal(cssLength("clamp(3.375rem, 6vw, 6.25rem)", laptop), 76.8);
  assert.equal(cssLength("54svh", phone), 455.76);
  assert.throws(() => cssLength("url(x)", phone));

  const hero = "(max-width: 1099px) min(84vw, 416px), min(54svh, calc(42vw - 220px))";
  assert.equal(slotWidth(hero, phone), 327.6);
  assert.equal(slotWidth(hero, laptop), Math.min(432, 317.6));
  assert.equal(slotWidth("(min-width:900px) min(38vw,470px), (max-width:719px) 86vw, 44vw", phone), 335.4);
  assert.equal(slotWidth("(min-width:900px) min(38vw,470px), (max-width:719px) 86vw, 44vw", { cssWidth: 800, cssHeight: 600, dpr: 1 }), 352);
  assert.equal(slotWidth(undefined, phone), 390);

  const srcset = "/assets/portrait/calm-520.webp?v=2 520w, /assets/portrait/calm-776.webp?v=2 776w";
  assert.equal(pickCandidate(srcset, hero, phone), "/assets/portrait/calm-776.webp?v=2");
  assert.equal(pickCandidate(srcset, hero, laptop), "/assets/portrait/calm-520.webp?v=2");
  /* Nothing covers 1200 × 2, so the largest is fetched. */
  assert.equal(pickCandidate(srcset, "100vw", { cssWidth: 1200, cssHeight: 800, dpr: 2 }), "/assets/portrait/calm-776.webp?v=2");
  assert.equal(pickCandidate("/a.png, /b.png 2x", "100vw", phone), "/a.png");
});

test("unexpected deployable file types fail", () => {
  withFixture({}, (root) => {
    recordBaseline(root);
    write(root, "dist/video.mp4", "not really a video\n");
    const result = run(root, "check-delivery-speed.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unexpected deployable file type \.mp4/);
  });
});

test("repository policy rejects unpinned actions", () => {
  withFixture({}, (root) => {
    const path = join(root, ".github/workflows/ci.yml");
    const workflow = readFileSync(path, "utf8")
      .replace(/actions\/checkout@[a-f0-9]{40}/, "actions/checkout@v4");
    writeFileSync(path, workflow);
    const result = run(root, "check-repository.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not pinned to a full SHA/);
  });
});

test("the harness stays out of GitHub language statistics", () => {
  withFixture({}, (root) => {
    write(root, "src/app.js", "document.documentElement.dataset.ready = 'true';\n");
    const attribute = (path) => spawnSync("git", ["check-attr", "linguist-vendored", "--", path], {
      cwd: root,
      encoding: "utf8"
    }).stdout.trim();
    for (const harness of [
      "scripts/check-delivery-speed.mjs",
      "scripts/check-repository.mjs",
      "scripts/config.mjs",
      "scripts/run-project-checks.mjs",
      "tests/harness.test.mjs"
    ]) {
      assert.equal(attribute(harness), `${harness}: linguist-vendored: set`);
    }
    assert.equal(attribute("src/app.js"), "src/app.js: linguist-vendored: unspecified");
  });
});

test("the dependency update policy and language rules are required", () => {
  withFixture({}, (root) => {
    rmSync(join(root, ".gitattributes"));
    rmSync(join(root, ".github/dependabot.yml"));
    const result = run(root, "check-repository.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing harness file: \.gitattributes/);
    assert.match(result.stderr, /Missing harness file: \.github\/dependabot\.yml/);
  });
});

test("dependabot groups minor and patch updates behind a cooldown", () => {
  const [, actions, npm, ...extra] = readFileSync(join(templateRoot, ".github/dependabot.yml"), "utf8")
    .split(/^\s*- package-ecosystem:/m);
  assert.equal(extra.length, 0);
  assert.match(actions, /^\s*"github-actions"/);
  assert.match(npm, /^\s*"npm"/);
  for (const ecosystem of [actions, npm]) {
    assert.match(ecosystem, /interval: "weekly"/);
    assert.match(ecosystem, /default-days: 7/);
    assert.match(ecosystem, /update-types:\s*\n\s*- "minor"\s*\n\s*- "patch"/);
    assert.doesNotMatch(ecosystem, /"major"/);
  }
  // Action tags are not guaranteed to be semantic versions.
  assert.doesNotMatch(actions, /semver-[a-z]+-days/);
  assert.match(npm, /semver-major-days: 14/);
  assert.match(npm, /semver-minor-days: 7/);
  assert.match(npm, /semver-patch-days: 3/);
});

test("the OSV scan reports findings and fails the workflow", () => {
  const workflow = readFileSync(join(templateRoot, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /osv-scanner-action@[a-f0-9]{40}/);
  assert.match(workflow, /osv-reporter-action@[a-f0-9]{40}/);
  assert.match(workflow, /--gh-annotations=true/);
  assert.match(workflow, /--fail-on-vuln=true/);
});

test("the production deploy explains every check it fails", () => {
  /* The post-deploy verification ran on bare `test` comparisons once. When
     the sha256 guard tripped on 2026-08-29 the job went red without printing
     a single line: the site was deployed and healthy, the failure said
     nothing, and the cause had to be reconstructed by reading the workflow.
     Every check now names itself and prints expected against actual — a
     guard that cannot say why it fired costs more than the fault it
     catches. */
  const workflow = readFileSync(
    join(templateRoot, ".github/workflows/ks-production-deploy.yml"),
    "utf8"
  );
  const step = workflow.slice(workflow.indexOf("Deploy, validate, purge"));
  assert.match(step, /verify\(\) \{/, "the verification helper is gone");
  assert.match(step, /expected '\$expected', got '\$actual'/);
  assert.ok(
    (step.match(/^\s+verify "/gm) ?? []).length >= 3,
    "the served pages and the redirect must each go through verify"
  );

  /* A comparison run as a bare command is the silent shape: `set -e` takes
     the exit code and prints nothing. Conditions inside `if` are fine —
     those branch into a message. */
  const silent = step
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^test\s/.test(line) || /^\[\[.*\]\]$/.test(line));
  assert.deepEqual(silent, [], "these checks fail without saying anything");

  /* And `--fail` is the other silent shape, one layer down: on a 404 or a
     500 curl exits nonzero inside the substitution and `set -e` ends the
     step before `verify` can name the page and print the status it got. A
     request whose status is the thing being checked must be allowed to
     return that status. Requests that only fetch (the purge, the script)
     keep `--fail` and are wrapped in a message of their own. */
  for (const [request] of step.matchAll(/curl[\s\S]*?\n(?=\s*(?:\)|fi|verify|echo|expected))/g)) {
    if (!/write-out '%\{(?:http_code|redirect_url)\}'/.test(request)) continue;
    assert.ok(
      !/--fail\b/.test(request),
      `a status-compared request carries --fail, so verify never runs:\n${request.trim()}`
    );
  }
});

test("configuration paths cannot escape the repository", () => {
  withFixture({}, (root) => {
    const path = join(root, "web-design.config.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    config.performance.outputDirectory = "../outside";
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
    const result = run(root, "check-repository.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must stay inside the repository/);
  });
});
