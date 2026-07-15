#!/usr/bin/env bash

set -euo pipefail

if ! command -v rg >/dev/null 2>&1; then
  printf 'error: ripgrep (rg) is required for the reka-ui import guard.\n' >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REKA_IMPORT_PATTERN="(?:from\\s+|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)[\"']reka-ui(?:/[^\"']*)?[\"']"

if rg \
    --color=never \
    --line-number \
    --column \
    --pcre2 \
    --glob 'src/**/*.{js,mjs,cjs,ts,tsx,vue}' \
    --glob 'apps/**/*.{js,mjs,cjs,ts,tsx,vue}' \
    -- "$REKA_IMPORT_PATTERN" \
    .
then
  printf '\nerror: reka-ui imports are forbidden in src/ and apps/.\n' >&2
  printf '       Use the stable @daopk/ui facade instead.\n' >&2
  exit 1
fi

printf 'ok: no reka-ui imports in src/ or apps/.\n'
