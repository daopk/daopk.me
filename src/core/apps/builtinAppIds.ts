import { FIRST_PARTY_APP_ID_LIST } from "~/core/apps/firstParty/registry";

/**
 * Reserved ids owned by shell-bundled system apps and independently-published
 * first-party apps. External first-party ids are sourced from the catalog
 * allowlist; shell-bundled ids are listed here.
 */
export const BUILTIN_APP_IDS: ReadonlySet<string> = new Set([
  ...FIRST_PARTY_APP_ID_LIST,
  "finder",
  "settings",
  "terminal",
  "trash",
  // Reserved for the first-party App Store (registered in a later phase).
  "app-store",
]);
