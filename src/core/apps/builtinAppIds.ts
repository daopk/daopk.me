/**
 * Reserved ids that external apps may never claim. This is a fast STATIC gate
 * used by the external-manifest validator; the authoritative runtime check at
 * install time is `kernel.apps.list()` (the live registry), which also catches
 * any drift if a new built-in is added without updating this set.
 *
 * Keep in sync with the manifests registered in `src/main.ts`. Ids beginning
 * with `_` (dev-only apps like `_template`, `_kit-gallery`) are additionally
 * rejected by a separate rule, so they need not be listed here.
 */
export const BUILTIN_APP_IDS: ReadonlySet<string> = new Set([
  "blog",
  "browser",
  "calendar",
  "clock",
  "editor",
  "finder",
  "notes",
  "pdf-viewer",
  "photos",
  "settings",
  "slides",
  "terminal",
  "trash",
  // Reserved for the first-party App Store (registered in a later phase).
  "app-store",
]);
