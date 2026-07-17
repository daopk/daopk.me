import { debugWarn } from "~/core/debug";
import { createImageIcon } from "~/icons/createIcon";
import { FallbackAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";
import type {
  DesktopContextMenuAction,
  DesktopContextMenuItemManifest,
  DesktopRendererManifest,
} from "~/types/desktop";
import type { Kernel } from "~/types/kernel";
import type { AppPreviewProvider } from "~/types/preview";
import type { WidgetManifest } from "~/types/widget";
import type { Component } from "vue";

import {
  coerceFirstPartyCatalog,
  fetchFirstPartyCatalog,
  resolveTrustedAppAssetUrl,
} from "./catalog";
import { resolveFirstPartyPreviewMatcher } from "./previewMatchers";
import { FIRST_PARTY_APP_ID_LIST } from "./registry";
import type {
  FirstPartyCatalogAppManifest,
  FirstPartyCatalogDesktopContextMenuDescriptor,
  FirstPartyCatalogDesktopRendererDescriptor,
  FirstPartyCatalogEntry,
  FirstPartyCatalogPreviewDescriptor,
  FirstPartyCatalogWidgetDescriptor,
} from "./types";

/**
 * Loads an app's published ES module. Returns the raw module namespace so the
 * default export (the app component) and any named widget/preview exports can
 * both be resolved from the single fetched module.
 */
export type FirstPartyModuleLoader = () => Promise<Record<string, unknown>>;

/**
 * Wrap a resolved component in an ESM-flagged record. Every manifest consumer
 * (`AppMount` + widget/preview surfaces) feeds `component` straight to Vue's
 * `defineVaporAsyncComponent`, which only unwraps `.default` when the resolved value
 * is module-shaped (`__esModule` or `Symbol.toStringTag === "Module"`).
 */
function asEsmModule(component: Component): { default: Component } {
  return { default: component, __esModule: true } as { default: Component };
}

/**
 * Build an icon component from an app-owned, release-shipped icon ref resolved
 * against the app's entry module URL. Returns a neutral fallback if the ref
 * cannot be resolved to a trusted asset URL (it already passed shape validation
 * at catalog coercion time, so this is defense-in-depth, not the happy path).
 */
function resolveAppIcon(entryUrl: string, appId: string, ref: string): Component {
  const url = resolveTrustedAppAssetUrl(entryUrl, appId, ref);
  return url === null ? FallbackAppIcon : createImageIcon(url, `AppIcon:${appId}:${ref}`);
}

function toWidgetManifest(
  descriptor: FirstPartyCatalogWidgetDescriptor,
  load: FirstPartyModuleLoader,
  entryUrl: string,
  appId: string,
): WidgetManifest {
  const { exportName, icon, ...rest } = descriptor;
  return {
    ...rest,
    ...(icon === undefined ? {} : { icon: resolveAppIcon(entryUrl, appId, icon) }),
    component: () => load().then((module) => asEsmModule(module[exportName] as Component)),
  };
}

function toPreviewProvider(
  manifestId: string,
  descriptor: FirstPartyCatalogPreviewDescriptor,
  load: FirstPartyModuleLoader,
): AppPreviewProvider {
  const { exportName, match, ...rest } = descriptor;
  return {
    ...rest,
    manifestId,
    component: () => load().then((module) => asEsmModule(module[exportName] as Component)),
    match: resolveFirstPartyPreviewMatcher(match, manifestId),
  };
}

function toDesktopContextMenuItem(
  descriptor: FirstPartyCatalogDesktopContextMenuDescriptor,
  load: FirstPartyModuleLoader,
): DesktopContextMenuItemManifest {
  const { exportName, ...rest } = descriptor;
  return {
    ...rest,
    action: () => load().then((module) => module[exportName] as DesktopContextMenuAction),
  };
}

function toDesktopRenderer(
  descriptor: FirstPartyCatalogDesktopRendererDescriptor,
  load: FirstPartyModuleLoader,
): DesktopRendererManifest {
  const { exportName, ...rest } = descriptor;
  return {
    ...rest,
    component: () => load().then((module) => asEsmModule(module[exportName] as Component)),
  };
}

export function firstPartyCatalogManifestToAppManifest(
  catalogManifest: FirstPartyCatalogAppManifest,
  load: FirstPartyModuleLoader,
  entryUrl: string,
  version: string,
  build = 0,
  revision?: string,
): AppManifest {
  const manifest: AppManifest = {
    id: catalogManifest.id,
    name: catalogManifest.name,
    version,
    build,
    icon: resolveAppIcon(entryUrl, catalogManifest.id, catalogManifest.icon),
    category: catalogManifest.category,
    component: () => load().then((module) => asEsmModule(module.default as Component)),
  };

  if (revision !== undefined) manifest.revision = revision;
  if (catalogManifest.hidden !== undefined) manifest.hidden = catalogManifest.hidden;
  if (catalogManifest.singleton !== undefined) manifest.singleton = catalogManifest.singleton;
  if (catalogManifest.autorun !== undefined) manifest.autorun = catalogManifest.autorun;
  if (catalogManifest.supportedShells !== undefined) {
    manifest.supportedShells = catalogManifest.supportedShells;
  }
  if (catalogManifest.permissions !== undefined) {
    manifest.permissions = [...catalogManifest.permissions];
  }
  if (catalogManifest.defaultWindow !== undefined) {
    manifest.defaultWindow = catalogManifest.defaultWindow;
  }
  if (catalogManifest.chrome !== undefined) manifest.chrome = catalogManifest.chrome;
  if (catalogManifest.keywords !== undefined) manifest.keywords = [...catalogManifest.keywords];
  if (catalogManifest.settings !== undefined) manifest.settings = catalogManifest.settings;
  if (catalogManifest.widgets !== undefined) {
    manifest.widgets = catalogManifest.widgets.map((widget) =>
      toWidgetManifest(widget, load, entryUrl, catalogManifest.id),
    );
  }
  if (catalogManifest.previews !== undefined) {
    manifest.previews = catalogManifest.previews.map((preview) =>
      toPreviewProvider(catalogManifest.id, preview, load),
    );
  }
  if (catalogManifest.desktop !== undefined) {
    manifest.desktop = {
      ...(catalogManifest.desktop.contextMenu === undefined
        ? {}
        : {
            contextMenu: catalogManifest.desktop.contextMenu.map((item) =>
              toDesktopContextMenuItem(item, load),
            ),
          }),
      ...(catalogManifest.desktop.renderers === undefined
        ? {}
        : {
            renderers: catalogManifest.desktop.renderers.map((renderer) =>
              toDesktopRenderer(renderer, load),
            ),
          }),
    };
  }

  return manifest;
}

export function firstPartyCatalogEntryToAppManifest(
  entry: FirstPartyCatalogEntry,
): AppManifest | null {
  if (entry.manifest === undefined) {
    return null;
  }
  const load: FirstPartyModuleLoader = () =>
    import(/* @vite-ignore */ entry.entry) as Promise<Record<string, unknown>>;
  return firstPartyCatalogManifestToAppManifest(
    entry.manifest,
    load,
    entry.entry,
    entry.version,
    entry.build,
    entry.revision,
  );
}

function manifestFromDevEntry(
  entry: FirstPartyCatalogEntry,
  load: FirstPartyModuleLoader,
): AppManifest | null {
  if (entry.manifest === undefined) {
    return null;
  }
  return firstPartyCatalogManifestToAppManifest(
    entry.manifest,
    load,
    entry.entry,
    entry.version,
    entry.build,
    entry.revision,
  );
}

/**
 * Register the first-party app roster against the kernel. Two lanes:
 *  - **dev**: load app metadata from app-owned manifest JSON and code from
 *    workspace packages (HMR; no network catalog).
 *  - **prod**: fetch the same-origin catalog and register each app with a
 *    loader that imports its release-pinned module URL on launch.
 */
export async function registerFirstPartyApps(
  kernel: Kernel,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  if (import.meta.env.DEV) {
    const [{ FIRST_PARTY_DEV_ENTRIES }, { FIRST_PARTY_DEV_CATALOG_ENTRIES }] = await Promise.all([
      import("./devEntries"),
      import("./devManifests"),
    ]);
    const catalog = coerceFirstPartyCatalog({ apps: FIRST_PARTY_DEV_CATALOG_ENTRIES });
    const entries = new Map(catalog.apps.map((app) => [app.id, app]));

    for (const id of FIRST_PARTY_APP_ID_LIST) {
      const load = FIRST_PARTY_DEV_ENTRIES[id];
      const entry = entries.get(id);
      if (load === undefined || entry === undefined) {
        debugWarn("[first-party]", `no dev manifest/loader for "${id}" — skipping`);
        continue;
      }
      const manifest = manifestFromDevEntry(entry, load);
      if (manifest !== null) {
        kernel.apps.register(manifest, { source: "external" });
      }
    }
    return;
  }

  const catalog = await fetchFirstPartyCatalog({ signal: options.signal });
  const entries = new Map(catalog.apps.map((app) => [app.id, app]));

  for (const id of FIRST_PARTY_APP_ID_LIST) {
    const entry = entries.get(id);
    if (entry === undefined) {
      debugWarn("[first-party]", `no catalog entry for "${id}" — skipping`);
      continue;
    }

    const manifest = firstPartyCatalogEntryToAppManifest(entry);
    if (manifest !== null) {
      kernel.apps.register(manifest, { source: "external" });
    } else {
      debugWarn("[first-party]", `catalog entry for "${id}" has no runtime manifest — skipping`);
    }
  }
}
