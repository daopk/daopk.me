import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { comparePostsNewestFirst, readBlogPosts } from "./lib/blogPosts.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const POSTS_DIR = join(ROOT, "blog");
const INDEX_FILE = join(POSTS_DIR, "index.json");

/**
 * Build `blog/index.json`, the runtime manifest the Blog app fetches to render
 * its list without reading every markdown file. Keep the shape minimal and
 * stable: the app derives everything else (formatted date, excerpt, path) from
 * these fields.
 */
async function main() {
  const posts = await readBlogPosts(POSTS_DIR);
  const sorted = [...posts].sort(comparePostsNewestFirst);

  const index = sorted.map((post) => ({
    slug: post.slug,
    title: post.metadata.title,
    date: post.metadata.date,
    description: post.metadata.description,
  }));

  await writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  console.log(`Generated blog/index.json with ${index.length} post${index.length === 1 ? "" : "s"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
