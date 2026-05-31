import { peekShellStickyOverride } from "~/core/routing/shellSticky";

import DesktopShell from "~/shells/desktop/DesktopShell.vue";
import MobileShell from "~/shells/mobile/MobileShell.vue";

import type { DeviceProfile, ShellComponent, ShellId } from "~/types/shell";

export { peekShellStickyOverride };

export interface PickedShell {
  readonly shellId: ShellId;
  readonly component: ShellComponent;
}

export function pickShell(profile: DeviceProfile, sticky?: ShellId): PickedShell {
  const stickyChoice = sticky ?? peekShellStickyOverride();

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
