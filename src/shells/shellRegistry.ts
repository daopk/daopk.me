import { debugWarn } from "~/core/debug";

import DesktopShell from "~/shells/desktop/DesktopShell.vue";
import MobileShell from "~/shells/mobile/MobileShell.vue";

import type { DeviceProfile, ShellComponent, ShellId } from "~/types/shell";

export interface PickedShell {
  readonly shellId: ShellId;
  readonly component: ShellComponent;
}

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

export function pickShell(profile: DeviceProfile, sticky?: ShellId): PickedShell {
  const stickyChoice = sticky ?? stickyBootstrap;

  if (stickyChoice === "desktop" || stickyChoice === "mobile") {
    const component = stickyChoice === "desktop" ? DesktopShell : MobileShell;
    return { shellId: stickyChoice, component };
  }

  const shellId: ShellId = profile.formFactor === "mobile" ? "mobile" : "desktop";

  return {
    shellId,
    component: shellId === "mobile" ? MobileShell : DesktopShell,
  };
}
