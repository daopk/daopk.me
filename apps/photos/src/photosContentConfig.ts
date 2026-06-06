function publicApiUrl(pathname: string): string {
  const configured = import.meta.env.VITE_PUBLIC_API_ORIGIN;
  const origin =
    configured === undefined || configured.length === 0 ? "" : configured.replace(/\/+$/, "");
  return `${origin}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

/**
 * Where the Photos app pulls its gallery from at runtime.
 *
 * Images live in a dedicated Cloudflare R2 bucket (`daopk-photos`). `daopk-api`
 * enumerates that bucket and serves both the generated index and the image
 * bytes under `/public/photos/*`.
 */
export const PHOTOS_INDEX_FILENAME = "index.json";

/** Public API namespace mapped to the R2 photos bucket. */
export const PHOTOS_CONTENT_BASE = publicApiUrl("/public/photos");

export function photosIndexUrl(base: string = PHOTOS_CONTENT_BASE): string {
  return `${base}/${PHOTOS_INDEX_FILENAME}`;
}

/**
 * Thumbnail widths the API is allowed to generate. The grid renders the 1x size
 * and lets the browser pick the 2x variant on high-density displays.
 */
export const PHOTO_THUMB_WIDTH = 400;
export const PHOTO_THUMB_WIDTH_2X = 800;

/** Public URL for a width-constrained variant the API resizes + caches. */
export function photoThumbUrl(
  key: string,
  width: number,
  base: string = PHOTOS_CONTENT_BASE,
): string {
  return `${base}/${key}?w=${width}`;
}
