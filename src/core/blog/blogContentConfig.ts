/**
 * Where the Blog app pulls live content from at runtime.
 *
 * Posts live as `blog/<slug>.md` in the GitHub repo. CI publishes them (plus a
 * generated `index.json` manifest) to a Cloudflare R2 bucket, and the Worker
 * serves them same-origin under `/blog/*`. Fetching same-origin avoids the COEP
 * `credentialless` constraints that a cross-origin CDN would introduce, and new
 * posts appear without redeploying the app.
 *
 * To point the app at a different origin later (e.g. a public R2 domain or a
 * CDN), only {@link BLOG_CONTENT_BASE} needs to change.
 */
export const BLOG_INDEX_FILENAME = "index.json";

/** Same-origin path the Worker maps to the R2 blog bucket. */
export const BLOG_CONTENT_BASE = "/blog";

export function blogRawIndexUrl(base: string = BLOG_CONTENT_BASE): string {
  return `${base}/${BLOG_INDEX_FILENAME}`;
}

export function blogRawPostUrl(slug: string, base: string = BLOG_CONTENT_BASE): string {
  return `${base}/${slug}.md`;
}
