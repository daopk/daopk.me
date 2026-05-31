import { useInstalledAppsStore } from "~/core/apps/InstalledAppsStore";
import { reconcileInstalledApps } from "~/core/apps/reconcileInstalledApps";
import type { BootPhase } from "~/core/boot/types";

/**
 * Registers installed external apps after the kernel is initialized (so the
 * store is hydrated and the search adapter exists). Runs reconcile, which both
 * unregisters stale external ids (covers HMR / profile re-init — the registry
 * is never auto-cleared) and registers each stored app fail-safe. A single bad
 * manifest is skipped inside reconcile; it must never fail boot.
 */
export const installedAppsPhase: BootPhase = {
  id: "installed-apps",
  label: "Installed Apps",
  weight: 10,
  async run(ctx) {
    if (ctx.signal.aborted) {
      return;
    }
    const store = useInstalledAppsStore();
    reconcileInstalledApps(ctx.kernel, store.list());
  },
};
