import { defineComponent, h, markRaw, type Component } from "vue";

import ExternalAppIcon from "~/components/app/ExternalAppIcon.vue";
import type { AppChromeManifest, AppManifest } from "~/types/app";
import type { ExternalAppManifest } from "~/types/externalApp";

/**
 * Adapt a validated, serializable {@link ExternalAppManifest} into a runtime
 * {@link AppManifest} the kernel can register and launch:
 *  - `icon` becomes a `markRaw` wrapper around `ExternalAppIcon` (url/iconify);
 *  - `component` becomes a loader that dynamically imports the remote `entry`
 *    module — `@vite-ignore` keeps the runtime URL out of the build graph, and
 *    the import resolves `vue`/`@daopk/sdk` to the host via the import map;
 *  - `version` and the optional fields are mapped straight through.
 *
 * The adapter never sets `autorun` (external apps cannot auto-launch).
 */
export function externalToAppManifest(ext: ExternalAppManifest): AppManifest {
  const icon = markRaw(
    defineComponent({
      name: `ExternalAppIcon-${ext.id}`,
      setup() {
        return () => h(ExternalAppIcon, { icon: ext.icon, label: ext.name });
      },
    }),
  );

  const manifest: AppManifest = {
    id: ext.id,
    name: ext.name,
    version: ext.version,
    icon,
    category: ext.category,
    component: () => import(/* @vite-ignore */ ext.entry) as Promise<{ default: Component }>,
  };

  if (ext.permissions !== undefined) {
    manifest.permissions = [...ext.permissions];
  }
  if (ext.defaultWindow !== undefined) {
    manifest.defaultWindow = { ...ext.defaultWindow };
  }
  if (ext.chrome !== undefined) {
    const chrome: AppChromeManifest = {};
    if (ext.chrome.mobile !== undefined) {
      chrome.mobile = { ...ext.chrome.mobile };
    }
    manifest.chrome = chrome;
  }
  if (ext.singleton !== undefined) {
    manifest.singleton = ext.singleton;
  }
  if (ext.keywords !== undefined) {
    manifest.keywords = [...ext.keywords];
  }

  return manifest;
}
