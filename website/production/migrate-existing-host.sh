#!/usr/bin/env bash
# Transactionally repoint an existing KS production host from the old
# kiaquila/web-design trust path to kiaquila/ks.
#
# This script is for the one host that already serves ks-design.art. A fresh
# host uses install-deploy-access.sh instead; that installer refuses to touch a
# host whose mirror points elsewhere and sends the operator here.
#
# Everything is validated before the first write. The swap itself runs under
# the production deployment lock, from a staged copy, with a recorded backup;
# any failure after the backup restores the old web-design trust path and
# verifies the restoration. A second run after success reports idempotently and
# changes nothing.
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: migrate-existing-host.sh \
  --new-action-public-key-file <path> \
  --new-source-key <path> \
  --expected-new-main <40-hex-sha> \
  --expected-old-wrapper-sha256 <64-hex-sha256> \
  --expected-old-run-id <run-id> \
  --expected-old-tree <40-hex-sha> \
  --expected-running-revision <40-hex-sha>

Every value is written down during the cutover snapshot, immediately before
this script runs. If any of them no longer matches the live host, the
migration stops before its first write.
USAGE
  exit 2
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
common_source="$script_dir/production-common.sh"
[[ -f "$common_source" && ! -L "$common_source" ]] || {
  echo "Missing production-common.sh next to this script." >&2
  exit 1
}
# shellcheck source=production-common.sh
source "$common_source"

fail() {
  echo "$*" >&2
  exit 1
}

# Production always runs from the real root; the fake-root behaviour tests set
# KS_MIGRATE_TEST_ROOT while running unprivileged. Root execution never honours
# the override, so a poisoned environment cannot redirect the real migration.
root_prefix=""
if [[ "${EUID}" -ne 0 ]]; then
  [[ -n "${KS_MIGRATE_TEST_ROOT:-}" ]] || fail "Run the migration as root."
  root_prefix="${KS_MIGRATE_TEST_ROOT%/}"
fi

deploy_user="ksdeploy"
old_remote="git@github.com:kiaquila/web-design.git"
new_remote="git@github.com:kiaquila/ks.git"
# The fake-root tests substitute local repositories for the two GitHub remotes.
# Root execution ignores the overrides together with the path prefix above.
if [[ "${EUID}" -ne 0 ]]; then
  old_remote="${KS_MIGRATE_TEST_OLD_REMOTE:-$old_remote}"
  new_remote="${KS_MIGRATE_TEST_NEW_REMOTE:-$new_remote}"
fi
project_dir="$root_prefix/opt/ks-design-portfolio"
state_dir="$root_prefix/var/lib/ks-production"
state_file="$state_dir/latest-candidate"
trust_repository_file="$state_dir/trust-repository"
source_git_dir="$state_dir/source.git"
staged_source_git_dir="$state_dir/staged-source.git"
backup_dir="$state_dir/web-design-trust-backup"
lock_file="$root_prefix/var/lock/ks-production-deploy.lock"
authorized_keys="$root_prefix/home/$deploy_user/.ssh/authorized_keys"
wrapper_target="$root_prefix/usr/local/sbin/ks-production-deploy"
ssh_command_target="$root_prefix/usr/local/sbin/ks-production-ssh-command"
common_target="$root_prefix/usr/local/libexec/ks-production-common.sh"
source_key="$root_prefix/root/.ssh/ks-production-source"
staged_source_key="$root_prefix/root/.ssh/ks-production-source.staged"
source_known_hosts="$root_prefix/root/.ssh/known_hosts"

new_action_public_key_file=""
new_source_key_source=""
expected_new_main=""
expected_old_wrapper_sha256=""
expected_old_run_id=""
expected_old_tree=""
expected_running_revision=""
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --new-action-public-key-file) new_action_public_key_file="${2:-}"; shift 2 ;;
    --new-source-key) new_source_key_source="${2:-}"; shift 2 ;;
    --expected-new-main) expected_new_main="${2:-}"; shift 2 ;;
    --expected-old-wrapper-sha256) expected_old_wrapper_sha256="${2:-}"; shift 2 ;;
    --expected-old-run-id) expected_old_run_id="${2:-}"; shift 2 ;;
    --expected-old-tree) expected_old_tree="${2:-}"; shift 2 ;;
    --expected-running-revision) expected_running_revision="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "$new_action_public_key_file" && -n "$new_source_key_source" &&
   -n "$expected_new_main" && -n "$expected_old_wrapper_sha256" &&
   -n "$expected_old_run_id" &&
   -n "$expected_old_tree" && -n "$expected_running_revision" ]] || usage
[[ "$expected_new_main" =~ ^[a-f0-9]{40}$ ]] || fail "Invalid expected new main revision."
[[ "$expected_old_wrapper_sha256" =~ ^[a-f0-9]{64}$ ]] || fail "Invalid expected old wrapper hash."
[[ "$expected_old_run_id" =~ ^[0-9]+$ ]] || fail "Invalid expected old run ID."
[[ "$expected_old_tree" =~ ^[a-f0-9]{40}$ ]] || fail "Invalid expected old tree hash."
[[ "$expected_running_revision" =~ ^[a-f0-9]{40}$ ]] || fail "Invalid expected running revision."

# Every file the transaction replaces and must be able to restore. The backup,
# the manifest, the rollback restore, and the idempotency check all read this
# list, so adding a file to the transaction cannot leave one of them behind.
BACKED_UP_TRUST_FILES=(
  authorized_keys
  latest-candidate
  ks-production-deploy
  ks-production-source
  ks-production-ssh-command
)

sha256() {
  sha256sum "$1" | cut -d' ' -f1
}

git_ssh() {
  local key="$1"
  echo "ssh -i $key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$source_known_hosts"
}

# The wrapper, SSH forced command, and shared helper that this migration
# installs must be byte-identical to the reviewed files sitting next to it,
# which the operator has already byte-compared against the merged kiaquila/ks
# main. The comparison against the independently fetched revision happens again
# below, after the staged mirror exists, so a tampered local copy cannot pass.
new_wrapper_source="$script_dir/server-deploy.sh"
new_ssh_command_source="$script_dir/ssh-command.sh"
[[ -f "$new_wrapper_source" && -f "$new_ssh_command_source" ]] ||
  fail "Reviewed replacement scripts are missing next to this script."

new_action_public_key="$(<"$new_action_public_key_file")" ||
  fail "Could not read the new action public key."
new_authorized_line="$(compose_restricted_authorized_key_line "${ssh_command_target#"$root_prefix"}" "$new_action_public_key")" ||
  fail "The new action public key is not a safe single Ed25519 key."
[[ -f "$new_source_key_source" && ! -L "$new_source_key_source" ]] ||
  fail "The new read-only source key is missing or unsafe."

# ---------------------------------------------------------------------------
# Idempotent success replay: report and change nothing only when every facet of
# the migrated state is present and valid.
# ---------------------------------------------------------------------------
already_migrated() {
  [[ -f "$trust_repository_file" && ! -L "$trust_repository_file" ]] || return 1
  [[ "$(<"$trust_repository_file")" == "kiaquila/ks" ]] || return 1
  [[ -d "$source_git_dir" && ! -L "$source_git_dir" ]] || return 1
  [[ "$(git --git-dir="$source_git_dir" remote get-url origin 2>/dev/null)" == "$new_remote" ]] || return 1
  [[ -f "$wrapper_target" ]] || return 1
  cmp --silent "$new_wrapper_source" "$wrapper_target" || return 1
  cmp --silent "$new_ssh_command_source" "$ssh_command_target" || return 1
  cmp --silent "$common_source" "$common_target" || return 1
  [[ -f "$authorized_keys" ]] || return 1
  # The contract is exactly one line; a grep would bless a file that also
  # admits something else.
  [[ "$(<"$authorized_keys")" == "$new_authorized_line" ]] || return 1
  # Immediately after migration the state is empty; after the first standalone
  # deployment the wrapper legitimately writes "run-id tree". Both are migrated
  # states — anything else is drift.
  if [[ ! -f "$state_file" || -L "$state_file" ]]; then return 1; fi
  if [[ -s "$state_file" ]]; then
    [[ "$(<"$state_file")" =~ ^[0-9]+\ [a-f0-9]{40}$ ]] || return 1
  fi
  [[ -d "$backup_dir" ]] || return 1
  # The rollback runbook's mandatory validation must actually pass, or the
  # "already migrated" verdict blesses a state that cannot be rolled back. A
  # manifest written by an older revision verifies happily while missing an
  # entry this revision now restores, so completeness is checked too.
  [[ -f "$backup_dir/manifest.sha256" ]] || return 1
  local backed_up
  for backed_up in "${BACKED_UP_TRUST_FILES[@]}"; do
    [[ -f "$backup_dir/$backed_up" ]] || return 1
    grep -qE "[[:space:]]\*?${backed_up}\$" "$backup_dir/manifest.sha256" || return 1
  done
  ( cd "$backup_dir" && sha256sum --check --quiet manifest.sha256 ) >/dev/null 2>&1 || return 1
  # The old mirror is restored by cleanup and by the documented rollback, but it
  # is a directory rather than a hashed file, so it is checked by shape.
  [[ -d "$backup_dir/source.git" && ! -L "$backup_dir/source.git" ]] || return 1
  [[ "$(git --git-dir="$backup_dir/source.git" rev-parse --is-bare-repository 2>/dev/null)" == "true" ]] || return 1
  [[ "$(git --git-dir="$backup_dir/source.git" remote get-url origin 2>/dev/null)" == "$old_remote" ]] || return 1
  # Shape and remote survive a mirror that has lost its refs or objects, and
  # such a mirror cannot supply the revision the rollback would redeploy. The
  # recorded production tree must actually be readable, and the object graph
  # must be connected.
  # The deployed commit is what the rollback redeploys. A dangling tree survives
  # `fsck --connectivity-only`, so the commit itself — and the tree reachable
  # through it — must be readable.
  git --git-dir="$backup_dir/source.git" cat-file -e "${expected_running_revision}^{commit}" 2>/dev/null || return 1
  git --git-dir="$backup_dir/source.git" cat-file -e "${expected_running_revision}^{tree}" 2>/dev/null || return 1
  git --git-dir="$backup_dir/source.git" cat-file -e "${expected_old_tree}^{tree}" 2>/dev/null || return 1
  git --git-dir="$backup_dir/source.git" fsck --connectivity-only --no-progress >/dev/null 2>&1 || return 1
  # The staged key copy is retained through the rollback window; the installed
  # key matching it is what proves the new credential is the one in service.
  cmp --silent "$source_key" "$staged_source_key" 2>/dev/null || return 1
  return 0
}
if already_migrated; then
  echo "KS production trust is already migrated to kiaquila/ks; nothing to do."
  exit 0
fi

# ---------------------------------------------------------------------------
# Validate the old state completely before the first write.
# ---------------------------------------------------------------------------
[[ -f "$wrapper_target" && ! -L "$wrapper_target" ]] ||
  fail "The old production wrapper is missing or unsafe."
old_wrapper_sha256="$expected_old_wrapper_sha256"
[[ "$(sha256 "$wrapper_target")" == "$old_wrapper_sha256" ]] ||
  fail "The old production wrapper changed after the cutover snapshot."
[[ -d "$source_git_dir" && ! -L "$source_git_dir" ]] ||
  fail "The old trusted source mirror is missing or unsafe."
[[ "$(git --git-dir="$source_git_dir" rev-parse --is-bare-repository 2>/dev/null)" == "true" ]] ||
  fail "The old trusted source directory is not a bare Git repository."
[[ "$(git --git-dir="$source_git_dir" remote get-url origin)" == "$old_remote" ]] ||
  fail "The old trusted mirror does not target the recorded web-design remote."
# The rollback redeploys the recorded running revision out of this mirror, so
# the mirror must already be able to supply it — checked before the swap, not
# only on a later replay.
git --git-dir="$source_git_dir" cat-file -e "${expected_running_revision}^{commit}" 2>/dev/null ||
  fail "The old mirror does not contain the recorded running revision."
# The snapshot records the revision and the deployed tree separately, and the
# old wrapper refuses a redeploy where they disagree, so the two must describe
# the same state. The live host is pre-split: its `latest-candidate` holds
# `<revision>:ks`, the monorepo's KS project subtree — not a website tree.
# `:website` is accepted too, for a host already migrated to this repository's
# own layout.
[[ "$(git --git-dir="$source_git_dir" rev-parse --verify --quiet "${expected_running_revision}:ks" 2>/dev/null)" == "$expected_old_tree" ||
   "$(git --git-dir="$source_git_dir" rev-parse --verify --quiet "${expected_running_revision}:website" 2>/dev/null)" == "$expected_old_tree" ]] ||
  fail "The recorded running revision's deployed subtree is not the recorded deployment tree."
[[ -f "$state_file" && ! -L "$state_file" ]] ||
  fail "The old deployment state file is missing or unsafe."
[[ "$(<"$state_file")" == "$expected_old_run_id $expected_old_tree" ]] ||
  fail "The old deployment state does not match the cutover snapshot."
[[ -f "$authorized_keys" && ! -L "$authorized_keys" ]] ||
  fail "The deploy account's authorized_keys is missing or unsafe."
expected_authorized_keys_sha256="${KS_MIGRATE_EXPECTED_AUTHORIZED_KEYS_SHA256:-}"
[[ -n "$expected_authorized_keys_sha256" ]] ||
  fail "Record the authorized_keys SHA-256 in KS_MIGRATE_EXPECTED_AUTHORIZED_KEYS_SHA256 during the snapshot."
[[ "$(sha256 "$authorized_keys")" == "$expected_authorized_keys_sha256" ]] ||
  fail "authorized_keys changed after the cutover snapshot."
require_new_action_fingerprint "$new_action_public_key" "$authorized_keys" ||
  fail "The new action key must differ from every key the host already trusts."
[[ -f "$source_known_hosts" ]] || fail "The root known_hosts file is missing."
[[ -f "$source_key" && ! -L "$source_key" ]] ||
  fail "The old read-only source key is missing or unsafe."
[[ -f "$ssh_command_target" && ! -L "$ssh_command_target" ]] ||
  fail "The old forced-command handler is missing or unsafe."

if [[ -z "$root_prefix" ]]; then
  running_revision="$(docker ps --filter 'name=portfolio' --format '{{.Names}}' >/dev/null 2>&1 &&
    docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
      "$(cd "$project_dir" && docker compose -f production/docker-compose.yml ps -q portfolio)" 2>/dev/null || true)"
else
  running_revision="$(cat "$root_prefix/running-revision" 2>/dev/null || true)"
fi
[[ "$running_revision" == "$expected_running_revision" ]] ||
  fail "The running KS revision changed after the cutover snapshot."

# ---------------------------------------------------------------------------
# Stage everything next to the live state without touching it.
# ---------------------------------------------------------------------------
rm -rf -- "$staged_source_git_dir"
# The live state directory is 0710 root:ksdeploy by design — the deploy
# account needs traversal for its staging children — and an in-flight old
# deployment may still be using it, so its mode is not touched here.
[[ -d "$state_dir" ]] || fail "The production state directory is missing."
git init --bare "$staged_source_git_dir" >/dev/null
# The host umask leaves a fresh bare repository group- and world-readable, and
# the wrapper later widens the parent to group-traversable 0710 for ksdeploy's
# staging. The mirror itself must stay root-only, matching the installer.
chmod 0700 "$staged_source_git_dir"
git --git-dir="$staged_source_git_dir" remote add origin "$new_remote"
install -m 0600 "$new_source_key_source" "$staged_source_key"
GIT_SSH_COMMAND="$(git_ssh "$staged_source_key")" \
  git --git-dir="$staged_source_git_dir" fetch --force --no-tags origin \
  '+refs/heads/main:refs/remotes/origin/main'
staged_main="$(git --git-dir="$staged_source_git_dir" rev-parse refs/remotes/origin/main)"
[[ "$staged_main" == "$expected_new_main" ]] ||
  fail "kiaquila/ks main changed after the cutover snapshot."

# Byte-bind every file this migration installs to the independently fetched
# reviewed revision. A locally tampered copy fails here, before any swap.
require_git_blob_matches_file "$staged_source_git_dir" "$staged_main" \
  "website/production/server-deploy.sh" "$new_wrapper_source" || exit 1
require_git_blob_matches_file "$staged_source_git_dir" "$staged_main" \
  "website/production/ssh-command.sh" "$new_ssh_command_source" || exit 1
require_git_blob_matches_file "$staged_source_git_dir" "$staged_main" \
  "website/production/production-common.sh" "$common_source" || exit 1

# ---------------------------------------------------------------------------
# Swap under the production lock, with rollback armed from the first mutation.
# ---------------------------------------------------------------------------
open_production_lock "$lock_file" || fail "Could not acquire the production deployment lock."
# open_production_lock validated the target and holds it on fd 9.
flock --exclusive 9

# The pre-write validations above ran before the lock, and an old-repository
# deployment already holding it may have finished while this process waited.
# Everything the snapshot recorded is revalidated under the lock, so the swap
# cannot proceed against a live state the snapshot never described.
[[ "$(sha256 "$wrapper_target")" == "$old_wrapper_sha256" ]] ||
  fail "The old production wrapper changed while waiting for the lock."
[[ "$(git --git-dir="$source_git_dir" remote get-url origin)" == "$old_remote" ]] ||
  fail "The trusted mirror changed while waiting for the lock."
[[ "$(<"$state_file")" == "$expected_old_run_id $expected_old_tree" ]] ||
  fail "The deployment state changed while waiting for the lock."
[[ "$(sha256 "$authorized_keys")" == "$expected_authorized_keys_sha256" ]] ||
  fail "authorized_keys changed while waiting for the lock."
if [[ -z "$root_prefix" ]]; then
  locked_running_revision="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'     "$(cd "$project_dir" && docker compose -f production/docker-compose.yml ps -q portfolio)" 2>/dev/null || true)"
else
  locked_running_revision="$(cat "$root_prefix/running-revision" 2>/dev/null || true)"
fi
[[ "$locked_running_revision" == "$expected_running_revision" ]] ||
  fail "The running KS revision changed while waiting for the lock."

rm -rf -- "$backup_dir"
install -d -m 0700 "$backup_dir"

migration_complete=0
cleanup() {
  local status=$?
  if (( migration_complete )); then
    return 0
  fi
  echo "Migration failed; restoring the recorded web-design trust path." >&2
  if [[ -d "$backup_dir/source.git" ]]; then
    # The live path may already hold the new mirror; the backup holds the old
    # one, so displacing the new copy loses nothing.
    rm -rf -- "$source_git_dir"
    mv -- "$backup_dir/source.git" "$source_git_dir"
  fi
  if [[ -f "$backup_dir/authorized_keys" ]]; then
    cp --preserve=mode,ownership,timestamps "$backup_dir/authorized_keys" "$authorized_keys"
  fi
  if [[ -f "$backup_dir/latest-candidate" ]]; then
    cp --preserve=mode,ownership,timestamps "$backup_dir/latest-candidate" "$state_file"
  fi
  if [[ -f "$backup_dir/ks-production-deploy" ]]; then
    cp --preserve=mode,ownership,timestamps "$backup_dir/ks-production-deploy" "$wrapper_target"
  fi
  if [[ -f "$backup_dir/ks-production-source" ]]; then
    cp --preserve=mode,ownership,timestamps "$backup_dir/ks-production-source" "$source_key"
  fi
  if [[ -f "$backup_dir/ks-production-ssh-command" ]]; then
    cp --preserve=mode,ownership,timestamps "$backup_dir/ks-production-ssh-command" "$ssh_command_target"
  fi
  rm -f -- "$trust_repository_file"
  # Verify the restoration rather than assuming it.
  if [[ -f "$wrapper_target" && "$(sha256 "$wrapper_target")" == "$old_wrapper_sha256" ]] &&
     [[ "$(git --git-dir="$source_git_dir" remote get-url origin 2>/dev/null)" == "$old_remote" ]] &&
     [[ "$(<"$state_file")" == "$expected_old_run_id $expected_old_tree" ]] &&
     [[ "$(sha256 "$authorized_keys")" == "$expected_authorized_keys_sha256" ]] &&
     { [[ ! -f "$backup_dir/ks-production-source" ]] ||
       cmp --silent "$backup_dir/ks-production-source" "$source_key"; } &&
     { [[ ! -f "$backup_dir/ks-production-ssh-command" ]] ||
       cmp --silent "$backup_dir/ks-production-ssh-command" "$ssh_command_target"; }; then
    echo "Rollback verified: the web-design trust path is restored." >&2
  else
    echo "ROLLBACK VERIFICATION FAILED: reconcile the trust path by hand before any deploy." >&2
  fi
  exit "$status"
}
trap cleanup EXIT

# Backups first, then each swap step; order keeps every partial state
# restorable from what the backup already holds.
# Each backup is staged and renamed into place, so a copy interrupted part-way
# leaves no file for cleanup to restore. A half-written backup copied back over
# a still-valid live file is worse than no rollback at all.
backup_file() {
  local live="$1" name="$2"
  cp --preserve=mode,ownership,timestamps "$live" "$backup_dir/.$name.partial" ||
    fail "Could not back up $name."
  mv -f -- "$backup_dir/.$name.partial" "$backup_dir/$name"
}
backup_file "$authorized_keys" authorized_keys
backup_file "$state_file" latest-candidate
backup_file "$wrapper_target" ks-production-deploy
backup_file "$source_key" ks-production-source
backup_file "$ssh_command_target" ks-production-ssh-command
# The rollback runbook validates this manifest before restoring anything:
#   cd <backup-dir> && sha256sum -c manifest.sha256
( cd "$backup_dir" && sha256sum "${BACKED_UP_TRUST_FILES[@]}" > manifest.sha256 )
mv -- "$source_git_dir" "$backup_dir/source.git"

mv -- "$staged_source_git_dir" "$source_git_dir"
install -m 0600 "$staged_source_key" "$source_key"

install -d -m 0755 "$(dirname "$common_target")"
install -m 0644 "$common_source" "$common_target"
install -m 0755 "$new_wrapper_source" "$wrapper_target"
install -m 0755 "$new_ssh_command_source" "$ssh_command_target"

# Replace the old action admission with the new restricted line: keep every
# non-action line (none are expected), append the new line, drop old lines that
# carry a key, and land the result atomically with the old file's ownership.
authorized_tmp="${authorized_keys}.migrate.$$"
: > "$authorized_tmp"
chmod --reference="$authorized_keys" "$authorized_tmp"
chown --reference="$authorized_keys" "$authorized_tmp"
printf '%s\n' "$new_authorized_line" >> "$authorized_tmp"
[[ "$(wc -l < "$authorized_tmp")" -eq 1 ]] ||
  fail "The replacement authorized_keys must contain exactly one line."
validate_action_public_key "$(sed -E 's/^.*(ssh-ed25519 [A-Za-z0-9+/]{68})/\1/' "$authorized_tmp")" >/dev/null ||
  fail "The composed authorized_keys line failed validation."
grep -qE '^restrict,command="[^"]+" ssh-ed25519 ' "$authorized_tmp" ||
  fail "The composed authorized_keys line lost its forced command."
mv -f -- "$authorized_tmp" "$authorized_keys"

# New run-ID namespace: kiaquila/ks run IDs are unrelated to web-design's, so
# the state must start empty or the first standalone run would be rejected as
# older than the last web-design run.
atomic_empty_state_file "$state_file" || fail "Could not reset the deployment state."

umask 077
printf '%s\n' "kiaquila/ks" > "${trust_repository_file}.tmp.$$"
mv -f -- "${trust_repository_file}.tmp.$$" "$trust_repository_file"

# ---------------------------------------------------------------------------
# Verify the migrated state as a whole before declaring success.
# ---------------------------------------------------------------------------
[[ "$(git --git-dir="$source_git_dir" remote get-url origin)" == "$new_remote" ]] ||
  fail "Post-migration mirror remote verification failed."
[[ "$(git --git-dir="$source_git_dir" rev-parse refs/remotes/origin/main)" == "$expected_new_main" ]] ||
  fail "Post-migration mirror revision verification failed."
cmp --silent "$new_wrapper_source" "$wrapper_target" ||
  fail "Post-migration wrapper verification failed."
grep -qxF "$new_authorized_line" "$authorized_keys" ||
  fail "Post-migration authorized_keys verification failed."
[[ "$(<"$trust_repository_file")" == "kiaquila/ks" ]] ||
  fail "Post-migration namespace verification failed."
[[ -f "$state_file" && ! -s "$state_file" ]] ||
  fail "Post-migration state verification failed."

migration_complete=1
echo "KS_PRODUCTION_TRUST_MIGRATED"
echo "KS_PRODUCTION_MIGRATION_BACKUP=$backup_dir"
echo "Old trust path is preserved under $backup_dir for the rollback window."
