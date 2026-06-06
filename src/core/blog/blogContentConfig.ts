import { publicApiUrl } from "~/core/publicApi";

/**
 * Where the Blog app pulls live content from at runtime.
 *
 * Posts live as `blog/<slug>.md` in the GitHub repo. CI publishes them (plus a
 * generated `index.json` manifest) to a Cloudflare R2 bucket, and `daopk-api`
 * serves the raw content under `/public/blog/*`.
 */
export const BLOG_INDEX_FILENAME = "index.json";

/** Public API namespace mapped to the R2 blog bucket. */
export const BLOG_CONTENT_BASE = publicApiUrl("/public/blog");

export function blogRawIndexUrl(base: string = BLOG_CONTENT_BASE): string {
  return `${base}/${BLOG_INDEX_FILENAME}`;
}

export function blogRawPostUrl(slug: string, base: string = BLOG_CONTENT_BASE): string {
  return `${base}/${slug}.md`;
}
