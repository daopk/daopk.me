const PUBLIC_API_PATH_PREFIX = "/_api";

function publicApiUrl(pathname: string): string {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${PUBLIC_API_PATH_PREFIX}${normalizedPathname}`;
}

const PHOTOS_PUBLIC_PATH_PREFIX = "/public/photos";

function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where the Photos app pulls its gallery from at runtime.
 *
 * Images live in a dedicated Cloudflare R2 bucket (`daopk-photos`). The public
 * API enumerates that bucket and serves both the generated index and the image
 * bytes under `/public/photos/*`.
 */
const PHOTOS_INDEX_FILENAME = "index.json";

/** Public API namespace mapped to the R2 photos bucket. */
export const PHOTOS_CONTENT_BASE = publicApiUrl("/public/photos");

export function photosContentUrl(pathnameOrUrl: string): string {
  if (isAbsoluteUrl(pathnameOrUrl)) {
    return pathnameOrUrl;
  }

  const pathname = pathnameOrUrl.startsWith("/") ? pathnameOrUrl : `/${pathnameOrUrl}`;
  if (
    pathname === PHOTOS_PUBLIC_PATH_PREFIX ||
    pathname.startsWith(`${PHOTOS_PUBLIC_PATH_PREFIX}/`)
  ) {
    return publicApiUrl(pathname);
  }

  return `${PHOTOS_CONTENT_BASE}/${pathname.replace(/^\/+/, "")}`;
}

export function photosIndexUrl(base: string = PHOTOS_CONTENT_BASE): string {
  return `${base}/${PHOTOS_INDEX_FILENAME}`;
}

/**
 * Thumbnail widths the API is allowed to generate. The grid renders the 1x size
 * and lets the browser pick the 2x variant on high-density displays.
 */
// fallow-ignore-next-line unused-export
export const PHOTO_THUMB_WIDTH = 400;
// fallow-ignore-next-line unused-export
export const PHOTO_THUMB_WIDTH_2X = 800;

/** Public URL for a width-constrained variant the API resizes + caches. */
// fallow-ignore-next-line unused-export
export function photoThumbUrl(
  key: string,
  width: number,
  base: string = PHOTOS_CONTENT_BASE,
): string {
  return `${base}/${key}?w=${width}`;
}
