import type { FirstPartyModuleLoader } from "./registerFirstPartyApps";

/**
 * Dev-only loaders: in `pnpm dev` there is no catalog/R2, so first-party apps
 * load code straight from their workspace packages (full HMR, normal source
 * maps), while `devManifests.ts` imports each app-owned manifest JSON. Each
 * loader returns the app's module namespace, so the host can resolve the default
 * export plus any named widget/preview exports named by the manifest.
 *
 * This module is imported ONLY behind an `import.meta.env.DEV` gate
 * (registerFirstPartyApps.ts), so the workspace app packages are tree-shaken
 * out of the production shell bundle — matching the `_kit-gallery` dev pattern
 * in `src/main.ts`.
 */
// fallow-ignore-next-line unused-export
export const FIRST_PARTY_DEV_ENTRIES: Record<string, FirstPartyModuleLoader> = {
  "baby-touch": () => import("@daopk-app/baby-touch"),
  notes: () => import("@daopk-app/notes"),
  browser: () => import("@daopk-app/browser"),
  "youtube-player": () => import("@daopk-app/youtube-player"),
  editor: () => import("@daopk-app/editor"),
  movies: () => import("@daopk-app/movies"),
  "pdf-viewer": () => import("@daopk-app/pdf-viewer"),
  photos: () => import("@daopk-app/photos"),
  blog: () => import("@daopk-app/blog"),
  clock: () => import("@daopk-app/clock"),
  calendar: () => import("@daopk-app/calendar"),
};
