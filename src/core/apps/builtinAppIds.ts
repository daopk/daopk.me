/**
 * Reserved ids owned by shell-bundled system apps and independently-published
 * first-party apps. Keep in sync with the manifests registered in `src/main.ts`
 * and the first-party roster in `src/core/apps/firstParty/registry.ts`.
 */
export const BUILTIN_APP_IDS: ReadonlySet<string> = new Set([
  "baby-touch",
  "blog",
  "browser",
  "calendar",
  "clock",
  "editor",
  "finder",
  "html-in-canvas",
  // first-party, published independently (see firstParty/registry.ts)
  "notes",
  "pdf-viewer",
  "photos",
  "settings",
  "slides",
  "terminal",
  "trash",
  "youtube-player",
  // Reserved for the first-party App Store (registered in a later phase).
  "app-store",
]);
