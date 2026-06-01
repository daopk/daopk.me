import { registerFirstPartyApps } from "~/core/apps/firstParty/registerFirstPartyApps";
import { debugWarn } from "~/core/debug";

import type { BootPhase } from "~/core/boot/types";

/**
 * Registers first-party apps (built + published independently of the shell)
 * after the kernel is initialized and before the shell mounts, so they appear
 * in the launcher/dock for the first paint. In prod this fetches the same-origin
 * catalog; in dev it loads from workspace packages. Registration is fail-safe
 * (see `registerFirstPartyApps`) and must never fail boot — a catalog hiccup
 * just means those apps are absent this session, not a broken boot.
 */
export const firstPartyAppsPhase: BootPhase = {
  id: "first-party-apps",
  label: "First-Party Apps",
  weight: 10,
  async run(ctx) {
    if (ctx.signal.aborted) {
      return;
    }

    try {
      await registerFirstPartyApps(ctx.kernel, { signal: ctx.signal });
    } catch (error) {
      debugWarn("[boot]", "first-party app registration failed", error);
    }
  },
};
