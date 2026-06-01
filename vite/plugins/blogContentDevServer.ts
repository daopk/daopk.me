import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

import type { Connect, PluginOption } from "vite";

/**
 * In production the Worker serves `/blog/*` from R2. Vite has neither, so this
 * plugin serves the same paths from the local `blog/` folder during `dev` and
 * `preview`, keeping the app's same-origin fetches working offline of R2.
 */
interface DevBlogPost {
  slug: string;
  metadata: { title: string | null; date: string | null; description: string | null };
}

export function blogContentDevServer(): PluginOption {
  const postsDir = fileURLToPath(new URL("../../blog", import.meta.url));
  const blogLibUrl = new URL("../../scripts/lib/blogPosts.mjs", import.meta.url).href;
  const postFilePattern = /^\/blog\/([a-z0-9-]+)\.md$/;

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const pathname = (req.url ?? "").split("?")[0];

    if (pathname === "/blog/index.json") {
      void (async () => {
        try {
          const { readBlogPosts, comparePostsNewestFirst } = await import(blogLibUrl);
          const posts = (await readBlogPosts(postsDir)).sort(
            comparePostsNewestFirst,
          ) as DevBlogPost[];
          const index = posts.map((post) => ({
            slug: post.slug,
            title: post.metadata.title,
            date: post.metadata.date,
            description: post.metadata.description,
          }));
          res.setHeader("Content-Type", "application/json;charset=utf-8");
          res.end(JSON.stringify(index));
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      })();
      return;
    }

    const match = postFilePattern.exec(pathname);
    if (match !== null) {
      void (async () => {
        try {
          const markdown = await readFile(join(postsDir, `${match[1]}.md`), "utf8");
          res.setHeader("Content-Type", "text/markdown;charset=utf-8");
          res.end(markdown);
        } catch {
          res.statusCode = 404;
          res.end("Not found");
        }
      })();
      return;
    }

    next();
  };

  return {
    name: "blog-content-dev-server",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
