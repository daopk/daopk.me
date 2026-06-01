/**
 * Where the Photos app pulls its gallery from at runtime.
 *
 * Images live in a dedicated Cloudflare R2 bucket (`daopk-photos`). The Worker
 * enumerates that bucket and serves both the generated index and the image
 * bytes same-origin under `/_worker/photos/*` (see `worker/router.ts`). Fetching
 * same-origin avoids the COEP `credentialless` constraints a cross-origin CDN
 * would introduce, and new photos appear without redeploying the app.
 *
 * To point the app at a different origin later (e.g. a public R2 domain or a
 * CDN), only {@link PHOTOS_CONTENT_BASE} needs to change.
 */
export const PHOTOS_INDEX_FILENAME = "index.json";

/** Same-origin Worker namespace mapped to the R2 photos bucket. */
export const PHOTOS_CONTENT_BASE = "/_worker/photos";

export function photosIndexUrl(base: string = PHOTOS_CONTENT_BASE): string {
  return `${base}/${PHOTOS_INDEX_FILENAME}`;
}

export function photoUrl(key: string, base: string = PHOTOS_CONTENT_BASE): string {
  return `${base}/${key}`;
}

/**
 * Thumbnail widths the Worker is allowed to generate (see `PHOTO_THUMB_WIDTHS`
 * in `worker/router.ts`). The grid renders the 1x size and lets the browser
 * pick the 2x variant on high-density displays.
 */
export const PHOTO_THUMB_WIDTH = 400;
export const PHOTO_THUMB_WIDTH_2X = 800;

/** Same-origin URL for a width-constrained variant the Worker resizes + caches. */
export function photoThumbUrl(
  key: string,
  width: number,
  base: string = PHOTOS_CONTENT_BASE,
): string {
  return `${base}/${key}?w=${width}`;
}
