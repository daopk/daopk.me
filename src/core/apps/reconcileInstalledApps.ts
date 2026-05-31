import { debugWarn } from "~/core/debug";
import type { Kernel } from "~/types/kernel";

import { BUILTIN_APP_IDS } from "./builtinAppIds";
import { externalToAppManifest } from "./externalAppAdapter";
import type { InstalledAppRecord } from "./InstalledAppsStore";

/**
 * Make the kernel app registry match the set of installed external apps:
 *  - register any stored app that is not currently registered;
 *  - unregister any registered external app that is no longer stored.
 *
 * "External" is detected structurally: a registered id that is neither a
 * built-in (see {@link BUILTIN_APP_IDS}) nor a dev-only `_`-prefixed app. This
 * keeps reconcile stateless and correct across cold boot, profile switch
 * (registry is never auto-cleared), HMR, and cross-tab install/uninstall.
 *
 * Fail-safe: a single bad manifest is skipped + logged, never thrown — one
 * broken installed app must not break boot or registry sync.
 */
export function reconcileInstalledApps(
  kernel: Kernel,
  records: readonly InstalledAppRecord[],
): void {
  const desired = new Map(records.map((record) => [record.manifest.id, record] as const));
  const registered = new Set(kernel.apps.list().map((manifest) => manifest.id));

  for (const [id, record] of desired) {
    if (registered.has(id)) continue;
    try {
      kernel.apps.register(externalToAppManifest(record.manifest));
    } catch (error) {
      debugWarn("[installed-apps]", "failed to register external app", id, error);
    }
  }

  for (const id of registered) {
    if (desired.has(id)) continue;
    if (BUILTIN_APP_IDS.has(id) || id.startsWith("_")) continue;
    try {
      kernel.apps.unregister(id);
    } catch (error) {
      debugWarn("[installed-apps]", "failed to unregister stale external app", id, error);
    }
  }
}
