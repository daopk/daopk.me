/**
 * First-party app ids that the shell will accept from the external app catalog.
 * App identity and capabilities live in each `apps/<id>/app.manifest.json` and
 * are published through `/apps/index.json`; this allowlist is the remaining
 * shell-owned trust boundary for independently-shipped apps.
 */
export const FIRST_PARTY_APP_ID_LIST = [
  "baby-touch",
  "blog",
  "browser",
  "calendar",
  "clock",
  "editor",
  "html-in-canvas",
  "movies",
  "notes",
  "pdf-viewer",
  "photos",
  "youtube-player",
] as const;

export type FirstPartyAppId = (typeof FIRST_PARTY_APP_ID_LIST)[number];

export const FIRST_PARTY_APP_IDS: ReadonlySet<string> = new Set(FIRST_PARTY_APP_ID_LIST);

export function isFirstPartyAppId(id: string): id is FirstPartyAppId {
  return FIRST_PARTY_APP_IDS.has(id);
}
