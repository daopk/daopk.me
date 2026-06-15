#!/usr/bin/env bash
# This script is a soft audit: it must be invoked with `--audit`.
# Allowlist rationale:
# - token files define the system palette and must contain source hex values;
# - Settings appearance swatches intentionally expose user-selectable colors;
# - generated/icon SVG data contains upstream artwork colors, not UI tokens;
# - app-owned art/media palettes are intentionally local to that app surface
#   (blog reading palette, sticky note swatches, and video-player overlays);
# - tests and type fixtures may use literal values to cover parsing behavior.

set -euo pipefail

if ! command -v rg >/dev/null 2>&1; then
  printf 'error: ripgrep (rg) is required for this guard.\n' >&2
  printf '       Install via "brew install ripgrep" or your package manager.\n' >&2
  exit 2
fi

if [[ "${1:-}" != "--audit" ]]; then
  printf 'usage: bash scripts/check-no-raw-colors.sh --audit\n' >&2
  printf '       (audit-only — no implicit no-arg mode)\n' >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RAW_HEX_PATTERN='#[0-9A-Fa-f]{3,8}\b'

if rg \
    --color=never \
    --line-number \
    --column \
    --glob 'src/**/*.vue' \
    --glob 'src/**/*.ts' \
    --glob 'src/**/*.tsx' \
    --glob 'src/**/*.scss' \
    --glob 'src/**/*.css' \
    --glob 'apps/**/*.vue' \
    --glob 'apps/**/*.ts' \
    --glob 'apps/**/*.tsx' \
    --glob 'apps/**/*.scss' \
    --glob 'apps/**/*.css' \
    --glob '!src/assets/scss/_tokens.scss' \
    --glob '!src/assets/scss/tokens/**' \
    --glob '!src/core/theme/tokens.ts' \
    --glob '!src/icons/generated/**' \
    --glob '!src/icons/fluentColor.ts' \
    --glob '!src/apps/settings/sections/AppearanceSection.vue' \
    --glob '!src/utils/console.ts' \
    --glob '!src/types/kernel.ts' \
    --glob '!apps/blog/src/styles/blog.scss' \
    --glob '!apps/notes/src/DesktopStickyNote.vue' \
    --glob '!apps/movies/src/components/EpisodeView.vue' \
    --glob '!apps/movies/src/components/EpisodeList.vue' \
    --glob '!apps/movies/src/components/HomeView.vue' \
    --glob '!apps/movies/src/components/MovieHlsPlayer.vue' \
    --glob '!apps/movies/src/components/detail/DetailHero.vue' \
    --glob '!**/*.test.ts' \
    --glob '!**/*.test.tsx' \
    -- "$RAW_HEX_PATTERN" \
    .
then
  printf '\n' >&2
  printf 'audit: raw hex literal(s) detected outside the allowlist.\n' >&2
  printf '       Allowlist + rationale: see scripts/check-no-raw-colors.sh header.\n' >&2
  printf '       Either move the color into src/assets/scss/tokens/** or extend the allowlist.\n' >&2
  exit 1
fi

printf 'ok: no raw hex literals outside the allowlist (audit mode).\n'
