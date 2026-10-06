#!/usr/bin/env bash
set -euo pipefail

# Read the effective configuration, including overrides, without launching it.
image="$(docker compose -p ks-plausible config --format json | python3 -c \
  'import json, sys; print(json.load(sys.stdin)["services"]["plausible"]["image"])')"
expected=ghcr.io/plausible/community-edition:v3.2.1
if [[ "$image" != "$expected" ]]; then
  printf 'Refusing to launch Plausible: expected %s, got %s\n' "$expected" "$image" >&2
  exit 1
fi
printf 'Verified Plausible image: %s\n' "$image"
