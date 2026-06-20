/**
 * Trust boundary for first-party app module + asset URLs.
 *
 * First-party apps run in the trusted lane, so the catalog must never point that
 * lane at an arbitrary cross-origin URL. Entries must be release-pinned module
 * paths from the configured public API origin, and an app's icon/widget art may
 * only resolve to an asset inside that same release directory.
 */

/**
 * Entries must be release-pinned module paths from the configured public API
 * origin. First-party apps run in the trusted lane, so the catalog must never
 * point that lane at an arbitrary cross-origin URL.
 */
const TRUSTED_PUBLIC_API_ORIGIN = "https://daopk.me";
const ENTRY_PATH_PATTERN =
  /^\/(?:(?:_api\/)?public\/)?apps\/[a-z0-9][a-z0-9-]*\/[0-9A-Za-z.+-]+\/[A-Za-z0-9._/-]+\.js$/;
/** Same shape as the entry pattern but for an app-owned image icon asset. */
const ASSET_PATH_PATTERN =
  /^\/(?:(?:_api\/)?public\/)?apps\/[a-z0-9][a-z0-9-]*\/[0-9A-Za-z.+-]+\/[A-Za-z0-9._/-]+\.(?:svg|png|webp|avif)$/;

/**
 * App icon/widget refs are app-owned, release-shipped image filenames. They
 * must be a single flat filename (no path separators, no `..`) so they can only
 * resolve to an asset in the app's own release directory. `.svg` is preferred;
 * raster formats are allowed for apps whose identity art is a bitmap.
 */
const ICON_REF_PATTERN = /^[a-z0-9][a-z0-9._-]*\.(?:svg|png|webp|avif)$/;

export function isValidIconRef(value: unknown): value is string {
  return typeof value === "string" && ICON_REF_PATTERN.test(value) && !value.includes("..");
}

export function isTrustedEntryUrl(entry: string, id: string): boolean {
  const pathname = entry.startsWith("/") ? entry : absoluteEntryPathname(entry);
  if (pathname === null) {
    return false;
  }

  return (
    ENTRY_PATH_PATTERN.test(pathname) &&
    (pathname.startsWith(`/apps/${id}/`) ||
      pathname.startsWith(`/public/apps/${id}/`) ||
      pathname.startsWith(`/_api/public/apps/${id}/`))
  );
}

/**
 * Resolve an app-owned asset ref (validated by `isValidIconRef`) against the
 * app's entry module URL, returning a trusted, release-pinned asset URL or
 * `null`. The asset must live in the same release directory as the entry and
 * clear the same trusted-origin + `/apps/<id>/` checks as the entry itself, so
 * an app can only point its icon at its own published files.
 */
export function resolveTrustedAppAssetUrl(
  entryUrl: string,
  id: string,
  ref: string,
): string | null {
  if (!isValidIconRef(ref)) {
    return null;
  }
  const slash = entryUrl.lastIndexOf("/");
  if (slash < 0) {
    return null;
  }
  const assetUrl = `${entryUrl.slice(0, slash + 1)}${ref}`;
  return isTrustedAssetUrl(assetUrl, id) ? assetUrl : null;
}

function isTrustedAssetUrl(asset: string, id: string): boolean {
  const pathname = asset.startsWith("/") ? asset : absoluteEntryPathname(asset);
  if (pathname === null) {
    return false;
  }

  return (
    ASSET_PATH_PATTERN.test(pathname) &&
    (pathname.startsWith(`/apps/${id}/`) ||
      pathname.startsWith(`/public/apps/${id}/`) ||
      pathname.startsWith(`/_api/public/apps/${id}/`))
  );
}

function absoluteEntryPathname(entry: string): string | null {
  try {
    const url = new URL(entry);
    return isTrustedEntryOrigin(url.origin) ? url.pathname : null;
  } catch {
    return null;
  }
}

function isTrustedEntryOrigin(origin: string): boolean {
  if (origin === TRUSTED_PUBLIC_API_ORIGIN) {
    return true;
  }

  return globalThis.location?.origin === origin;
}
