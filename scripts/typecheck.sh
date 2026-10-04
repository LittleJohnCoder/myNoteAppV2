#!/usr/bin/env bash
# Type-check gate (SPEC §15, CODE_STYLE.md §15).
#
# Why this is not a bare `tsc --noEmit`:
# electrobun 1.18.1 ships raw .ts (not .d.ts) under dist/api, so `skipLibCheck`
# cannot cover it. Its FFI/GPU internals (dist/api/bun/proc/native.ts) raise 6
# assignability errors under every @types/bun from 1.3.8 to 1.4.2, with strict on
# or off, and it imports `three` (no bundled types -> needs @types/three).
#
# This gate fails on ANY error outside node_modules/electrobun/ and prints the
# quarantined dependency count, so a real project error can never hide behind it.
set -uo pipefail

out="$(bunx tsc --noEmit 2>&1)"
mine="$(printf '%s\n' "$out" | grep 'error TS' | grep -v '^node_modules/electrobun/' || true)"
dep="$(printf '%s\n' "$out" | grep 'error TS' | grep -c '^node_modules/electrobun/' || true)"

if [ -n "$mine" ]; then
  printf '%s\n' "$mine"
  printf 'type-check FAILED: %s project error(s)\n' "$(printf '%s\n' "$mine" | wc -l | tr -d ' ')"
  exit 1
fi

printf 'type-check OK — 0 project errors (%s known electrobun-internal error(s) quarantined)\n' "$dep"
