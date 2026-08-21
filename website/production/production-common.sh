#!/usr/bin/env bash
# Shared fail-closed helpers for the root-owned KS production trust path.

ks_fail() {
  echo "$*" >&2
  return 1
}

validate_action_public_key() {
  local public_key="${1-}"
  local pattern
  pattern='^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43}( [A-Za-z0-9][A-Za-z0-9._@:+,=/-]*( [A-Za-z0-9][A-Za-z0-9._@:+,=/-]*)*)?$'

  [[ -n "$public_key" && "$public_key" != *$'\n'* && "$public_key" != *$'\r'* ]] ||
    ks_fail "The action public key must be exactly one line."
  [[ "$public_key" =~ $pattern ]] ||
    ks_fail "Pass exactly one canonical SSH Ed25519 key and an optional safe comment."
}

compose_restricted_authorized_key_line() {
  local forced_command="${1-}"
  local public_key="${2-}"

  [[ "$forced_command" =~ ^/[A-Za-z0-9._/-]+$ ]] ||
    ks_fail "The forced command path is invalid."
  validate_action_public_key "$public_key" || return 1
  local line="restrict,command=\"$forced_command\" $public_key"
  [[ "$line" != *$'\n'* && "$line" != *$'\r'* ]] ||
    ks_fail "The composed authorization must remain exactly one line."
  printf '%s\n' "$line"
}

action_key_fingerprint() {
  local public_key="${1-}"
  validate_action_public_key "$public_key" >/dev/null || return 1
  printf '%s\n' "${public_key%% *} $(cut -d ' ' -f 2 <<<"$public_key")" |
    ssh-keygen -E sha256 -lf - 2>/dev/null |
    awk 'NR == 1 { print $2 }'
}

authorized_key_blobs() {
  local authorized_file="$1"
  local line pattern
  pattern='(^|[[:space:]])ssh-ed25519[[:space:]]+(AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43})([[:space:]]|$)'
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" != *$'\r'* ]] || ks_fail "authorized_keys contains a carriage return."
    if [[ "$line" =~ $pattern ]]; then
      printf 'ssh-ed25519 %s\n' "${BASH_REMATCH[2]}"
    fi
  done < "$authorized_file"
}

require_new_action_fingerprint() {
  local new_public_key="$1"
  local old_authorized_file="$2"
  local new_fingerprint old_key old_fingerprint
  new_fingerprint="$(action_key_fingerprint "$new_public_key")" || return 1
  [[ -n "$new_fingerprint" ]] || ks_fail "Could not fingerprint the new action key."

  while IFS= read -r old_key; do
    old_fingerprint="$(action_key_fingerprint "$old_key")" || return 1
    [[ "$new_fingerprint" != "$old_fingerprint" ]] ||
      ks_fail "The new action key fingerprint matches an existing authorized key."
  done < <(authorized_key_blobs "$old_authorized_file")
}

require_git_blob_matches_file() {
  local git_dir="$1"
  local revision="$2"
  local repository_path="$3"
  local local_file="$4"
  local reviewed_file

  reviewed_file="$(mktemp)" || return 1
  if ! git --git-dir="$git_dir" show "$revision:$repository_path" > "$reviewed_file"; then
    rm -f -- "$reviewed_file"
    ks_fail "Reviewed file is absent from the independently fetched revision: $repository_path"
    return 1
  fi
  if ! cmp --silent "$reviewed_file" "$local_file"; then
    rm -f -- "$reviewed_file"
    ks_fail "Local replacement does not match reviewed bytes: $repository_path"
    return 1
  fi
  rm -f -- "$reviewed_file"
}

open_production_lock() {
  local requested_lock="$1"
  local parent requested_parent_mode target_mode target_uid target_links
  local path_identity fd_identity

  parent="$(readlink -f -- "$(dirname -- "$requested_lock")")" ||
    ks_fail "Cannot resolve the production lock parent."
  [[ -d "$parent" && ! -L "$parent" ]] || ks_fail "Production lock parent is unsafe."
  [[ "$(stat -c '%u' "$parent")" == "$EUID" ]] ||
    ks_fail "Production lock parent has the wrong owner."
  requested_parent_mode="$(stat -c '%a' "$parent")"
  # A root-owned sticky lock directory such as /run/lock is safe even though it
  # is writable by other users; a non-sticky writable parent is not.
  if (( (8#$requested_parent_mode & 0022) != 0 && (8#$requested_parent_mode & 01000) == 0 )); then
    ks_fail "Production lock parent is writable without the sticky bit."
  fi

  [[ ! -L "$requested_lock" ]] || ks_fail "Production lock target must not be a symlink."
  if [[ ! -e "$requested_lock" ]]; then
    (umask 077; set -o noclobber; : > "$requested_lock") 2>/dev/null || true
  fi
  [[ -f "$requested_lock" && ! -L "$requested_lock" ]] ||
    ks_fail "Production lock target is not a regular file."
  target_uid="$(stat -c '%u' "$requested_lock")"
  target_mode="$(stat -c '%a' "$requested_lock")"
  target_links="$(stat -c '%h' "$requested_lock")"
  [[ "$target_uid" == "$EUID" && "$target_links" == "1" ]] ||
    ks_fail "Production lock target owner or link count is unsafe."
  (( (8#$target_mode & 0022) == 0 )) ||
    ks_fail "Production lock target must not be group- or other-writable."

  path_identity="$(stat -c '%d:%i' "$requested_lock")"
  exec 9<>"$requested_lock"
  fd_identity="$(stat -Lc '%d:%i' "/proc/$$/fd/9")"
  [[ "$path_identity" == "$fd_identity" ]] || ks_fail "Production lock changed while opening."
  flock --exclusive 9
}

atomic_empty_state_file() {
  local state_file="$1"
  local state_tmp="${state_file}.reset.$$"
  umask 077
  : > "$state_tmp"
  chmod 0600 "$state_tmp"
  mv -f -- "$state_tmp" "$state_file"
  [[ -f "$state_file" && ! -L "$state_file" && ! -s "$state_file" ]] ||
    ks_fail "Could not reset the cross-repository deployment state."
}
