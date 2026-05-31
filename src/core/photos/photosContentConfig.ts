/**
 * Where the Photos app pulls its gallery from at runtime.
 *
 * Images live in a dedicated Cloudflare R2 bucket (`daopk-photos`). The Worker
 * enumerates that bucket and serves both the generated index and the image
 * bytes same-origin under `/photos/*` (see `worker/router.ts`). Fetching
 * same-origin avoids the COEP `credentialless` constraints a cross-origin CDN
 * would introduce, and new photos appear without redeploying the app.
 *
 * To point the app at a different origin later (e.g. a public R2 domain or a
 * CDN), only {@link PHOTOS_CONTENT_BASE} needs to change.
 */
export const PHOTOS_INDEX_FILENAME = "index.json";

/** Same-origin path the Worker maps to the R2 photos bucket. */
export const PHOTOS_CONTENT_BASE = "/photos";

export function photosIndexUrl(base: string = PHOTOS_CONTENT_BASE): string {
  return `${base}/${PHOTOS_INDEX_FILENAME}`;
}

export function photoUrl(key: string, base: string = PHOTOS_CONTENT_BASE): string {
  return `${base}/${key}`;
}
