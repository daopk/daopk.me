import { debugWarn } from "~/core/debug";
import { BLOG_POSTS_ROOT, blogPostPathFromSlug } from "~/core/routing/blogPaths";
import type { VFS } from "~/core/vfs";

export const BLOG_POST_MIME_TYPE = "text/markdown;charset=utf-8";

export interface BuiltinBlogPost {
  readonly slug: string;
  readonly source: string;
}

const POST_FILE_PATTERN = /\/([^/]+)\.md$/;

const postSources = import.meta.glob<string>("../../content/posts/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
});

export const builtinBlogPosts: readonly BuiltinBlogPost[] = Object.entries(postSources)
  .map(([path, source]): BuiltinBlogPost | null => {
    const slug = POST_FILE_PATTERN.exec(path)?.[1];
    return slug === undefined ? null : { slug, source };
  })
  .filter((post): post is BuiltinBlogPost => post !== null)
  .sort((a, b) => a.slug.localeCompare(b.slug));

export async function seedBuiltinBlogPosts(vfs: VFS): Promise<void> {
  await vfs.mkdir(BLOG_POSTS_ROOT, { recursive: true });

  for (const post of builtinBlogPosts) {
    const path = blogPostPathFromSlug(post.slug);
    if (path === null) {
      debugWarn("[blog]", "skipping built-in post with invalid slug", post.slug);
      continue;
    }

    await vfs.writeText(path, post.source, {
      mimeType: BLOG_POST_MIME_TYPE,
      overwrite: true,
    });
  }
}
