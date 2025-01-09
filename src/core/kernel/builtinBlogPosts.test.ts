import { describe, expect, it } from "vitest";

import {
  BLOG_POST_MIME_TYPE,
  builtinBlogPosts,
  seedBuiltinBlogPosts,
} from "~/core/kernel/builtinBlogPosts";
import { createKernelVfs } from "~/core/kernel/kernelVfs";
import { BLOG_POSTS_ROOT, blogPostPathFromSlug } from "~/core/routing/blogPaths";

describe("seedBuiltinBlogPosts", () => {
  it("seeds the first built-in post into /home/posts", async () => {
    const vfs = createKernelVfs();
    const firstPost = builtinBlogPosts[0]!;
    const path = blogPostPathFromSlug(firstPost.slug)!;

    try {
      await seedBuiltinBlogPosts(vfs);

      await expect(vfs.readText(path)).resolves.toContain("Building a Tiny OS in the Browser");
      await expect(vfs.stat(path)).resolves.toMatchObject({
        kind: "file",
        mimeType: BLOG_POST_MIME_TYPE,
        path,
      });
    } finally {
      vfs.dispose();
    }
  });

  it("updates an existing VFS post from the bundled source", async () => {
    const vfs = createKernelVfs();
    const firstPost = builtinBlogPosts[0]!;
    const path = blogPostPathFromSlug(firstPost.slug)!;
    const existingSource = "# Custom Draft\n\nKeep this local edit.";

    try {
      await vfs.mkdir(BLOG_POSTS_ROOT, { recursive: true });
      await vfs.writeText(path, existingSource, {
        mimeType: BLOG_POST_MIME_TYPE,
      });

      await seedBuiltinBlogPosts(vfs);

      await expect(vfs.readText(path)).resolves.toBe(firstPost.source);
    } finally {
      vfs.dispose();
    }
  });
});
