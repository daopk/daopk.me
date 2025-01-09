import { normalizeVfsPath, type VfsPath } from "~/core/vfs/path";

export const SLIDES_ROOT = "/home/slides";
export const SLIDE_DECK_FILENAME = "slides.md";

const MAX_SLUG_LENGTH = 80;
const SAFE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export class SlideDeckPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlideDeckPathError";
  }
}

export function normalizeSlideDeckSlug(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

  if (!isSafeSlideDeckSlug(slug)) {
    throw new SlideDeckPathError("Slide deck slug must contain letters or numbers.");
  }

  return slug;
}

export function isSafeSlideDeckSlug(slug: string): boolean {
  return SAFE_SLUG_PATTERN.test(slug);
}

export function deckDirectoryFromSlug(slug: string): VfsPath {
  return normalizeVfsPath(`${SLIDES_ROOT}/${normalizeSlideDeckSlug(slug)}`);
}

export function deckPathFromSlug(slug: string): VfsPath {
  return normalizeVfsPath(`${deckDirectoryFromSlug(slug)}/${SLIDE_DECK_FILENAME}`);
}

export function isSlideDeckPath(path: string): boolean {
  const parsed = parseSlideDeckPath(path);
  return parsed !== null;
}

export function parseSlideDeckPath(
  path: string,
): { readonly slug: string; readonly directoryPath: VfsPath; readonly filePath: VfsPath } | null {
  let normalized: VfsPath;

  try {
    normalized = normalizeVfsPath(path);
  } catch {
    return null;
  }

  const prefix = `${SLIDES_ROOT}/`;
  if (!normalized.startsWith(prefix)) {
    return null;
  }

  const rest = normalized.slice(prefix.length);
  const segments = rest.split("/");
  if (segments.length !== 2 || segments[1] !== SLIDE_DECK_FILENAME) {
    return null;
  }

  const slug = segments[0] ?? "";
  if (!isSafeSlideDeckSlug(slug)) {
    return null;
  }

  return {
    slug,
    directoryPath: deckDirectoryFromSlug(slug),
    filePath: normalized,
  };
}
