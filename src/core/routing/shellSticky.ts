import { debugWarn } from "~/core/debug";

import type { ShellId } from "~/types/shell";

let stickyConsumed = false;
let stickyBootstrap: ShellId | undefined;

export function parseShellQueryOverride(search: string): ShellId | undefined {
  const trimmed = search.trim();
  if (!trimmed) {
    return undefined;
  }

  const qs = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
  const params = new URLSearchParams(qs);
  const raw = params.get("shell");

  if (raw === null) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "mobile" || normalized === "desktop") {
    return normalized;
  }

  debugWarn("[shell]", `unknown shell override "${raw}" — ignoring`);
  return undefined;
}

/** Captures sticky override derived from navigation search exactly once — idempotent afterward. */
export function ingestShellStickyFromSearchOnce(search: string): void {
  if (stickyConsumed) {
    return;
  }

  stickyConsumed = true;
  stickyBootstrap = parseShellQueryOverride(search);
}

export function peekShellStickyOverride(): ShellId | undefined {
  return stickyBootstrap;
}
