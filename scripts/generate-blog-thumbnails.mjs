#!/usr/bin/env node
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateBlogThumbnailsInBundle } from "./lib/blogThumbnails.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? "");
}

function envBoolean(value) {
  return value === "true" || value === "1";
}

const outDir = argValue("--out-dir", join(ROOT, "blog-dist"));
const postsDir = argValue("--posts-dir", join(ROOT, "blog"));
const currentIndexFile = argValue("--current-index", join(ROOT, "current-index.json"));
const slug = argValue("--slug", process.env.BLOG_THUMBNAIL_SLUG ?? "");
const regenerate = envBoolean(
  argValue("--regenerate", process.env.BLOG_REGENERATE_THUMBNAIL ?? "false"),
);

generateBlogThumbnailsInBundle({
  currentIndexFile,
  outDir,
  postsDir,
  regenerate,
  slug,
})
  .then(({ generated, reused, total }) => {
    console.log(
      `Blog thumbnails ready: ${generated} generated, ${reused} reused, ${total} post${
        total === 1 ? "" : "s"
      }.`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
