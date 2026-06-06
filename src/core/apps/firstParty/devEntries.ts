import type { FirstPartyModuleLoader } from "./registerFirstPartyApps";

/**
 * Dev-only loaders: in `pnpm dev` there is no catalog/R2, so first-party apps
 * load straight from their workspace packages (full HMR, normal source maps).
 * Each loader returns the app's module namespace, so the host can resolve both
 * the default export (the app component) and any named widget exports.
 *
 * This module is imported ONLY behind an `import.meta.env.DEV` gate
 * (registerFirstPartyApps.ts), so the workspace app packages are tree-shaken
 * out of the production shell bundle — matching the `_kit-gallery` dev pattern
 * in `src/main.ts`.
 */
export const FIRST_PARTY_DEV_ENTRIES: Record<string, FirstPartyModuleLoader> = {
  "baby-touch": () => import("@daopk-app/baby-touch"),
  notes: () => import("@daopk-app/notes"),
  browser: () => import("@daopk-app/browser"),
  "youtube-player": () => import("@daopk-app/youtube-player"),
  editor: () => import("@daopk-app/editor"),
  "html-in-canvas": () => import("@daopk-app/html-in-canvas"),
  movies: () => import("@daopk-app/movies"),
  "pdf-viewer": () => import("@daopk-app/pdf-viewer"),
  photos: () => import("@daopk-app/photos"),
  blog: () => import("@daopk-app/blog"),
  clock: () => import("@daopk-app/clock"),
  calendar: () => import("@daopk-app/calendar"),
  slides: () => import("@daopk-app/slides"),
};
