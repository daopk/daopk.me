import { debugWarn } from "~/core/debug";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import type { AppPreviewProvider } from "~/types/preview";
import type { WidgetManifest } from "~/types/widget";
import type { Component } from "vue";

import { fetchFirstPartyCatalog } from "./catalog";
import { FIRST_PARTY_APPS } from "./registry";
import type {
  FirstPartyAppDescriptor,
  FirstPartyCatalogEntry,
  FirstPartyPreviewDescriptor,
  FirstPartyWidgetDescriptor,
} from "./types";

/**
 * Loads an app's published ES module. Returns the raw module namespace so the
 * default export (the app component) and any named widget exports can both be
 * resolved from the single fetched module.
 */
export type FirstPartyModuleLoader = () => Promise<Record<string, unknown>>;

/**
 * Wrap a resolved component in an ESM-flagged record. Every manifest consumer
 * (`AppMount` + the widget surfaces) feeds `component` straight to Vue's
 * `defineAsyncComponent`, which only unwraps `.default` when the resolved value
 * is module-shaped (`__esModule` or `Symbol.toStringTag === "Module"`). Real
 * `import()` records carry that flag; a plain `{ default }` object does not and
 * would be treated as the component itself — rendering nothing, silently, in
 * production. Synthetic records picked from the app module must mirror it.
 */
function asEsmModule(component: Component): { default: Component } {
  return { default: component, __esModule: true } as { default: Component };
}

/** Build a widget's runtime loader from a named export of the app module. */
function toWidgetManifest(
  descriptor: FirstPartyWidgetDescriptor,
  load: FirstPartyModuleLoader,
): WidgetManifest {
  const { exportName, ...rest } = descriptor;
  return {
    ...rest,
    component: () => load().then((module) => asEsmModule(module[exportName] as Component)),
  };
}

/** Build a preview provider's runtime component loader from a named app export. */
function toPreviewProvider(
  manifestId: string,
  descriptor: FirstPartyPreviewDescriptor,
  load: FirstPartyModuleLoader,
): AppPreviewProvider {
  const { exportName, ...rest } = descriptor;
  return {
    ...rest,
    manifestId,
    component: () => load().then((module) => asEsmModule(module[exportName] as Component)),
  };
}

/** Build a runtime `AppManifest` from the host-owned identity + a module loader. */
export function firstPartyDescriptorToAppManifest(
  descriptor: FirstPartyAppDescriptor,
  load: FirstPartyModuleLoader,
  version: string,
  build = 0,
  revision?: string,
): AppManifest {
  const manifest: AppManifest = {
    id: descriptor.id,
    name: descriptor.name,
    version,
    build,
    icon: descriptor.icon,
    category: descriptor.category,
    component: () => load().then((module) => asEsmModule(module.default as Component)),
  };

  if (revision !== undefined) manifest.revision = revision;
  if (descriptor.hidden !== undefined) manifest.hidden = descriptor.hidden;
  if (descriptor.singleton !== undefined) manifest.singleton = descriptor.singleton;
  if (descriptor.autorun !== undefined) manifest.autorun = descriptor.autorun;
  if (descriptor.supportedShells !== undefined) {
    manifest.supportedShells = descriptor.supportedShells;
  }
  if (descriptor.permissions !== undefined) manifest.permissions = [...descriptor.permissions];
  if (descriptor.defaultWindow !== undefined) manifest.defaultWindow = descriptor.defaultWindow;
  if (descriptor.chrome !== undefined) manifest.chrome = descriptor.chrome;
  if (descriptor.keywords !== undefined) manifest.keywords = [...descriptor.keywords];
  if (descriptor.settings !== undefined) manifest.settings = descriptor.settings;
  if (descriptor.widgets !== undefined) {
    manifest.widgets = descriptor.widgets.map((widget) => toWidgetManifest(widget, load));
  }
  if (descriptor.previews !== undefined) {
    manifest.previews = descriptor.previews.map((preview) =>
      toPreviewProvider(descriptor.id, preview, load),
    );
  }

  return manifest;
}

export function firstPartyCatalogEntryToAppManifest(
  entry: FirstPartyCatalogEntry,
): AppManifest | null {
  const descriptor = FIRST_PARTY_APPS.find((app) => app.id === entry.id);
  if (descriptor === undefined) {
    return null;
  }
  const load: FirstPartyModuleLoader = () =>
    import(/* @vite-ignore */ entry.entry) as Promise<Record<string, unknown>>;
  return firstPartyDescriptorToAppManifest(
    descriptor,
    load,
    entry.version,
    entry.build,
    entry.revision,
  );
}

/**
 * Register the first-party app roster against the kernel. Two lanes:
 *  - **dev**: load each app from its workspace package (HMR; no catalog).
 *  - **prod**: fetch the same-origin catalog and register each rostered app
 *    with a loader that imports its release-pinned module URL on launch.
 *
 * Fail-safe per app: a missing catalog entry (not yet published) or a bad
 * loader is skipped with a warning — it must never fail boot. Apps are
 * registered with a lazy `component` loader, so nothing is fetched until the
 * user actually launches the app (or a widget surface mounts).
 */
export async function registerFirstPartyApps(
  kernel: Kernel,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  if (import.meta.env.DEV) {
    const { FIRST_PARTY_DEV_ENTRIES } = await import("./devEntries");
    for (const descriptor of FIRST_PARTY_APPS) {
      const load = FIRST_PARTY_DEV_ENTRIES[descriptor.id];
      if (load === undefined) {
        debugWarn("[first-party]", `no dev loader for "${descriptor.id}" — skipping`);
        continue;
      }
      kernel.apps.register(firstPartyDescriptorToAppManifest(descriptor, load, descriptor.version));
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

    const manifest = firstPartyCatalogEntryToAppManifest(entry);
    if (manifest !== null) {
      kernel.apps.register(manifest);
    }
  }
}
