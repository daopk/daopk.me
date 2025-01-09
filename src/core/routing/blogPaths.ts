export const BLOG_POSTS_ROOT = "/home/posts";

const BLOG_SLUG_PATTERN = /^[a-z0-9-]+$/;

export function isBlogPostSlug(slug: string): boolean {
  return BLOG_SLUG_PATTERN.test(slug);
}

export function blogPostPathFromSlug(slug: string): string | null {
  return isBlogPostSlug(slug) ? `${BLOG_POSTS_ROOT}/${slug}.md` : null;
}
