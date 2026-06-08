export const COMMENT_SITE_ORIGIN = "https://daopk.me";

const COMMENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export interface CommentTarget {
  readonly canonicalUrl: string;
  readonly id: string;
  readonly title: string;
}

export type MediaCommentKind = "movie" | "tv";

function displayTitle(title: string | null | undefined, fallback: string): string {
  const trimmed = title?.trim();
  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
}

function isCommentSlug(value: string): boolean {
  return COMMENT_SLUG_PATTERN.test(value);
}

function positiveInteger(value: number): number | null {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function canonicalUrl(pathname: string): string {
  return `${COMMENT_SITE_ORIGIN}${pathname}`;
}

export function blogCommentTarget(slug: string, title?: string | null): CommentTarget | null {
  if (!isCommentSlug(slug)) {
    return null;
  }

  return {
    canonicalUrl: canonicalUrl(`/blog/${slug}`),
    id: `blog:${slug}`,
    title: displayTitle(title, slug),
  };
}

export function mediaCommentTarget(
  kind: MediaCommentKind,
  tmdbId: number,
  title?: string | null,
  slug?: string | null,
): CommentTarget | null {
  const id = positiveInteger(tmdbId);
  if (id === null) {
    return null;
  }

  const safeSlug = slug !== null && slug !== undefined && isCommentSlug(slug) ? slug : null;
  const pathname = safeSlug === null ? `/${kind}/${id}` : `/${kind}/${id}-${safeSlug}`;

  return {
    canonicalUrl: canonicalUrl(pathname),
    id: `${kind}:${id}`,
    title: displayTitle(title, `${kind}:${id}`),
  };
}
