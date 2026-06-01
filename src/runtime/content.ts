/**
 * Stable re-export façade for the host's first-party content helpers, emitted as
 * the `daopk-content-runtime` build entry. The import map in index.html points
 * the bare `@daopk/content` specifier at this entry's hashed chunk so the blog
 * and slides apps reuse the host's ONE copy of the blog content source, date
 * helpers, and the blog/slide post-path helpers. These modules are also used by
 * the host itself (e.g. `src/core/routing/appUrlIntents.ts` for blog; the finder
 * + spotlight "Open in Slides" routing for slide-deck paths), so exposing them
 * here keeps a single implementation rather than forking a copy into the apps.
 *
 * See `src/runtime/kit.ts` for the build-entry / `preserveEntrySignatures`
 * rationale.
 */
export {
  BLOG_INDEX_CACHE_PATH,
  BLOG_POST_MIME_TYPE,
  BlogNetworkError,
  createBlogContentSource,
} from "~/core/blog/blogContentSource";
export { formatBlogDate, validBlogDate } from "~/core/blog/blogDate";
export { BLOG_POSTS_ROOT, blogPostPathFromSlug, isBlogPostSlug } from "~/core/routing/blogPaths";
export {
  deckDirectoryFromSlug,
  deckPathFromSlug,
  normalizeSlideDeckSlug,
  parseSlideDeckPath,
  SLIDES_ROOT,
} from "~/core/routing/slidePaths";

export type {
  BlogContentSource,
  BlogContentSourceOptions,
  BlogContentVfs,
  BlogIndexEntry,
} from "~/core/blog/blogContentSource";
