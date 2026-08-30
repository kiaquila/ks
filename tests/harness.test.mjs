import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

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
  config.performance.criticalFiles = ["index.html"];
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
  if (configured) configure(root); else deconfigure(root);
  const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
  assert.equal(git.status, 0, git.stderr);
  const add = spawnSync("git", ["add", "-A"], { cwd: root, encoding: "utf8" });
  assert.equal(add.status, 0, add.stderr);
  write(root, "dist/index.html", "<!doctype html><title>Demo</title>\n");
  write(root, "dist/app.js", "document.documentElement.dataset.ready = 'true';\n");
  return root;
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

test("configured repository, project commands, and payload pass", () => {
  withFixture({}, (root) => {
    for (const script of [
      "check-repository.mjs",
      "run-project-checks.mjs",
      "check-performance-budget.mjs"
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

test("JavaScript gzip budget retains the Alex Neon 20 KiB ceiling", () => {
  withFixture({}, (root) => {
    write(root, "dist/app.js", randomBytes(25 * 1024));
    const result = run(root, "check-performance-budget.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.js gzip payload .* exceeds 20480 B/);
  });
});

test("critical first-render text retains the 45 KiB gzip ceiling", () => {
  withFixture({}, (root) => {
    write(root, "dist/index.html", randomBytes(47 * 1024));
    const result = run(root, "check-performance-budget.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Critical gzip payload .* exceeds 46080 B/);
  });
});

test("unexpected deployable file types fail", () => {
  withFixture({}, (root) => {
    write(root, "dist/video.mp4", "not really a video\n");
    const result = run(root, "check-performance-budget.mjs");
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
      "scripts/check-performance-budget.mjs",
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
