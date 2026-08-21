import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const wrapper = await readFile(
  resolve(root, "website/production/server-deploy.sh"),
  "utf8"
);
const installer = await readFile(
  resolve(root, "website/production/install-deploy-access.sh"),
  "utf8"
);
const sshCommand = await readFile(
  resolve(root, "website/production/ssh-command.sh"),
  "utf8"
);
const existingHostMigration = await readFile(
  resolve(root, "website/production/migrate-existing-host.sh"),
  "utf8"
);

test("the server wrapper accepts only validated staged candidates", () => {
  assert.match(wrapper, /\[\[ "\$\{EUID\}" -eq 0 \]\]/);
  assert.match(wrapper, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(wrapper, /\^\[0-9\]\+\$/);
  assert.match(wrapper, /staging directory owner must be ksdeploy/i);
  assert.match(wrapper, /open_production_lock "\$lock_file"/);
  assert.match(wrapper, /KS_PRODUCTION_DEPLOY_REGISTERED/);
  assert.match(wrapper, /KS_PRODUCTION_DEPLOY_SKIPPED/);
  assert.match(wrapper, /KS_PRODUCTION_DEPLOYED/);
  assert.match(wrapper, /Requested revision is absent from the trusted source mirror/);
  assert.match(wrapper, /Requested revision is not on the trusted main history/);
  assert.match(wrapper, /merge-base --is-ancestor "\$revision" "\$trusted_main"/);
  assert.match(wrapper, /Staged deployment payload does not match the trusted source revision/);
  assert.match(wrapper, /Current trusted main website tree differs from the registered candidate/);
  assert.match(wrapper, /-g ksdeploy -m 0710/);
  assert.match(wrapper, /diff --recursive --brief --no-dereference/);
  assert.match(wrapper, /source_remote="git@github\.com:kiaquila\/ks\.git"/);
  // Candidate, current trusted main, and archived payload are all compared
  // through the website subtree, never the whole root, so a governance-only
  // commit cannot invalidate an approved deployment candidate.
  assert.match(wrapper, /rev-parse "\$trusted_main:website"/);
  assert.match(wrapper, /rev-parse "\$revision:website"/);
  assert.match(wrapper, /archive --format=tar "\$revision:website"/);
  assert.doesNotMatch(wrapper, /rev-parse "\$(?:trusted_main|revision)"\s/);
  assert.match(wrapper, /trap cleanup EXIT/);
  assert.match(wrapper, /rsync --archive --delete --chown=root:root "\$trusted_payload\//);
  assert.match(
    wrapper,
    /docker inspect --format '\{\{index \.Config\.Labels "org\.opencontainers\.image\.revision"\}\}'/
  );
  assert.doesNotMatch(wrapper, /Labels \\"org\.opencontainers\.image\.revision\\"/);
});

test("the deploy account is limited to the root-owned wrapper", () => {
  assert.match(installer, /useradd --create-home --shell \/bin\/bash/);
  assert.match(installer, /install -o root -g root -m 0755/);
  assert.match(installer, /NOPASSWD: \$wrapper_target \*/);
  assert.match(installer, /compose_restricted_authorized_key_line/);
  assert.match(
    installer,
    /chown root:"\$deploy_user" "\/home\/\$deploy_user\/.ssh\/authorized_keys"/
  );
  assert.match(installer, /chmod 0640 "\/home\/\$deploy_user\/.ssh\/authorized_keys"/);
  assert.match(installer, /ssh-command\.sh/);
  assert.match(installer, /ks-production-source/);
  assert.match(installer, /source_remote="git@github\.com:kiaquila\/ks\.git"/);
  assert.match(installer, /git init --bare/);
  assert.match(installer, /chmod 0700 "\$source_git_dir"/);
  assert.match(installer, /-g "\$deploy_user" -m 0710/);
  assert.doesNotMatch(installer, /docker \*/i);
});

test("the fresh-host installer rejects an old mirror before its first write", () => {
  const remoteValidation = installer.indexOf('existing_remote="$(');
  const firstWrite = Math.min(
    installer.indexOf('useradd --create-home'),
    installer.indexOf('install -d -o root -g root -m 0755'),
    installer.indexOf('printf \'%s\\n\' "$authorized_line"')
  );
  assert.ok(remoteValidation >= 0, "missing existing-mirror preflight");
  assert.ok(firstWrite > remoteValidation, "installer writes before validating the existing remote");
  assert.match(installer, /use migrate-existing-host\.sh instead/);
});

test("the existing-host migration validates old state before staging or live writes", () => {
  const oldWrapperCheck = existingHostMigration.indexOf(
    '[[ "$(sha256 "$wrapper_target")" == "$old_wrapper_sha256" ]]'
  );
  const oldRemoteCheck = existingHostMigration.indexOf(
    '[[ "$(git --git-dir="$source_git_dir" remote get-url origin)" == "$old_remote" ]]'
  );
  const oldStateCheck = existingHostMigration.indexOf(
    '[[ "$(<"$state_file")" == "$expected_old_run_id $expected_old_tree" ]]'
  );
  const firstStagingWrite = existingHostMigration.indexOf('git init --bare "$staged_source_git_dir"');
  assert.ok(oldWrapperCheck >= 0 && oldRemoteCheck >= 0 && oldStateCheck >= 0);
  assert.ok(firstStagingWrite > oldWrapperCheck);
  assert.ok(firstStagingWrite > oldRemoteCheck);
  assert.ok(firstStagingWrite > oldStateCheck);
  assert.match(existingHostMigration, /expected_authorized_keys_sha256/);
  assert.match(existingHostMigration, /running KS revision changed after the cutover snapshot/i);
  assert.match(existingHostMigration, /cmp --silent "\$source_key" "\$staged_source_key"/);
});

test("the existing-host migration is exact-head, idempotent, and rollback-preserving", () => {
  assert.match(existingHostMigration, /expected_new_main/);
  assert.match(existingHostMigration, /kiaquila\/ks main changed after the cutover snapshot/);
  assert.match(existingHostMigration, /KS production trust is already migrated to kiaquila\/ks/);
  assert.match(existingHostMigration, /flock --exclusive 9/);
  assert.match(existingHostMigration, /trap cleanup EXIT/);
  assert.match(existingHostMigration, /Migration failed; restoring the recorded web-design trust path/);
  assert.match(existingHostMigration, /mv -- "\$source_git_dir" "\$backup_dir\/source\.git"/);
  assert.match(existingHostMigration, /mv -- "\$staged_source_git_dir" "\$source_git_dir"/);
  assert.match(existingHostMigration, /cp --preserve=mode,ownership,timestamps "\$authorized_keys"/);
  assert.match(existingHostMigration, /printf '%s\\n' "\$new_authorized_line" >> "\$authorized_tmp"/);
  assert.doesNotMatch(existingHostMigration, /> "\$authorized_keys"/);
  assert.match(existingHostMigration, /KS_PRODUCTION_MIGRATION_BACKUP=/);
});

test("the deploy key has no arbitrary SSH command path", () => {
  assert.match(sshCommand, /SSH_ORIGINAL_COMMAND/);
  assert.match(sshCommand, /Rejected SSH command/);
  assert.match(sshCommand, /wrapper=.*ks-production-deploy/);
  assert.match(sshCommand, /\$wrapper\\ register/);
  assert.match(sshCommand, /\$wrapper\\ deploy/);
  assert.match(sshCommand, /tar -xf - -C/);
  assert.doesNotMatch(sshCommand, /bash -c/);
});
