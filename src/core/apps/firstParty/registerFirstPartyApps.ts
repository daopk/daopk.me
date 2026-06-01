import { debugWarn } from "~/core/debug";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import type { Component } from "vue";

import { fetchFirstPartyCatalog } from "./catalog";
import { FIRST_PARTY_APPS } from "./registry";
import type { FirstPartyAppDescriptor } from "./types";

type ComponentLoader = () => Promise<{ default: Component }>;

/** Build a runtime `AppManifest` from the host-owned identity + a code loader. */
function toManifest(
  descriptor: FirstPartyAppDescriptor,
  component: ComponentLoader,
  version: string,
): AppManifest {
  const manifest: AppManifest = {
    id: descriptor.id,
    name: descriptor.name,
    version,
    icon: descriptor.icon,
    category: descriptor.category,
    component,
  };

  if (descriptor.hidden !== undefined) manifest.hidden = descriptor.hidden;
  if (descriptor.singleton !== undefined) manifest.singleton = descriptor.singleton;
  if (descriptor.autorun !== undefined) manifest.autorun = descriptor.autorun;
  if (descriptor.supportedShells !== undefined) {
    manifest.supportedShells = descriptor.supportedShells;
  }
  if (descriptor.permissions !== undefined) manifest.permissions = [...descriptor.permissions];
  if (descriptor.defaultWindow !== undefined) manifest.defaultWindow = descriptor.defaultWindow;
  if (descriptor.keywords !== undefined) manifest.keywords = [...descriptor.keywords];
  if (descriptor.widgets !== undefined) manifest.widgets = descriptor.widgets;

  return manifest;
}

/**
 * Register the first-party app roster against the kernel. Two lanes:
 *  - **dev**: load each app from its workspace package (HMR; no catalog).
 *  - **prod**: fetch the same-origin catalog and register each rostered app
 *    with a loader that imports its version-pinned module URL on launch.
 *
 * Fail-safe per app: a missing catalog entry (not yet published) or a bad
 * loader is skipped with a warning — it must never fail boot. Apps are
 * registered with a lazy `component` loader, so nothing is fetched until the
 * user actually launches the app.
 */
export async function registerFirstPartyApps(
  kernel: Kernel,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  if (import.meta.env.DEV) {
    const { FIRST_PARTY_DEV_ENTRIES } = await import("./devEntries");
    for (const descriptor of FIRST_PARTY_APPS) {
      const loader = FIRST_PARTY_DEV_ENTRIES[descriptor.id];
      if (loader === undefined) {
        debugWarn("[first-party]", `no dev loader for "${descriptor.id}" — skipping`);
        continue;
      }
      kernel.apps.register(toManifest(descriptor, loader, descriptor.version));
    }
    return;
  }

  const catalog = await fetchFirstPartyCatalog({ signal: options.signal });
  const entries = new Map(catalog.apps.map((app) => [app.id, app]));

  for (const descriptor of FIRST_PARTY_APPS) {
    const entry = entries.get(descriptor.id);
    if (entry === undefined) {
      debugWarn("[first-party]", `no catalog entry for "${descriptor.id}" — skipping`);
      continue;
    }

    const loader: ComponentLoader = () =>
      import(/* @vite-ignore */ entry.entry) as Promise<{ default: Component }>;
    kernel.apps.register(toManifest(descriptor, loader, entry.version));
  }
}
