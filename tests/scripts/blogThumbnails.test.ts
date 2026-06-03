import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BLOG_THUMBNAIL_DEFAULT_MODEL,
  BLOG_THUMBNAIL_HEIGHT,
  BLOG_THUMBNAIL_WIDTH,
  generateBlogThumbnailsInBundle,
  isBlogThumbnail,
  mergeReusableThumbnails,
  runCloudflareImageGeneration,
} from "../../scripts/lib/blogThumbnails.mjs";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

const OLD_THUMBNAIL = {
  url: "/_worker/blog/thumbnails/post-a/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
  width: BLOG_THUMBNAIL_WIDTH,
  height: BLOG_THUMBNAIL_HEIGHT,
  alt: "Post A thumbnail",
};

const SEO_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:url" content="https://daopk.me/blog/post-a" />
    <meta name="twitter:card" content="summary" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"Post A"}</script>
  </head>
  <body></body>
</html>
`;

function cloudflareImageResponse() {
  return new Response(JSON.stringify({ result: { image: PNG_BYTES.toString("base64") } }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

let tmpRoots: string[] = [];

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account");
  vi.stubEnv("CLOUDFLARE_AI_API_TOKEN", "");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "fallback-token");
});

async function makeBundle(entries: unknown[]) {
  const root = await mkdtemp(join(tmpdir(), "blog-thumbnails-"));
  tmpRoots.push(root);
  const postsDir = join(root, "blog");
  const outDir = join(root, "blog-dist");
  await mkdir(join(outDir, "seo/posts"), { recursive: true });
  await mkdir(postsDir, { recursive: true });
  await writeFile(join(outDir, "index.json"), `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  for (const entry of entries) {
    const slug = (entry as { slug: string }).slug;
    await writeFile(
      join(postsDir, `${slug}.md`),
      `---
title: "Post ${slug.at(-1)?.toUpperCase() ?? "A"}"
description: "A concise description."
---

This is a post about browser operating system experiments.`,
      "utf8",
    );
    await writeFile(join(outDir, "seo/posts", `${slug}.html`), SEO_HTML, "utf8");
  }

  return { outDir, postsDir, root };
}

afterEach(async () => {
  await Promise.all(tmpRoots.map((root) => rm(root, { recursive: true, force: true })));
  tmpRoots = [];
  vi.unstubAllEnvs();
});

describe("blog thumbnails", () => {
  it("recognizes and reuses valid thumbnail metadata from the current R2 index", () => {
    expect(isBlogThumbnail(OLD_THUMBNAIL, "post-a")).toBe(true);

    const [entry] = mergeReusableThumbnails(
      [{ slug: "post-a", title: "Post A", date: null, description: null, thumbnail: null }],
      [{ slug: "post-a", thumbnail: OLD_THUMBNAIL }],
    );

    expect(entry?.thumbnail).toEqual(OLD_THUMBNAIL);
  });

  it("generates and writes a thumbnail when a post is missing one", async () => {
    const { outDir, postsDir } = await makeBundle([
      { slug: "post-a", title: "Post A", date: null, description: "A post.", thumbnail: null },
    ]);
    const generateImage = vi.fn(async () => PNG_BYTES);

    const result = await generateBlogThumbnailsInBundle({
      generateImage,
      outDir,
      postsDir,
    });

    const index = JSON.parse(await readFile(join(outDir, "index.json"), "utf8"));
    const thumbnail = index[0].thumbnail;
    expect(result).toEqual({ generated: 1, reused: 0, total: 1 });
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ apiToken: "fallback-token", model: BLOG_THUMBNAIL_DEFAULT_MODEL }),
    );
    expect(thumbnail.url).toMatch(/^\/_worker\/blog\/thumbnails\/post-a\/[a-f0-9]{64}\.png$/);
    await expect(
      readFile(join(outDir, thumbnail.url.replace("/_worker/blog/", ""))),
    ).resolves.toEqual(PNG_BYTES);

    const seo = await readFile(join(outDir, "seo/posts/post-a.html"), "utf8");
    expect(seo).toContain('content="summary_large_image"');
    expect(seo).toContain('property="og:image"');
    expect(seo).toContain('"image":"https://daopk.me/_worker/blog/thumbnails/post-a/');
  });

  it("regenerates only the requested single slug", async () => {
    const { outDir, postsDir, root } = await makeBundle([
      { slug: "post-a", title: "Post A", date: null, description: "A post.", thumbnail: null },
      { slug: "post-b", title: "Post B", date: null, description: "B post.", thumbnail: null },
    ]);
    const currentIndexFile = join(root, "current-index.json");
    const postBThumbnail = {
      url: "/_worker/blog/thumbnails/post-b/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp",
      width: BLOG_THUMBNAIL_WIDTH,
      height: BLOG_THUMBNAIL_HEIGHT,
      alt: "Post B thumbnail",
    };
    await writeFile(
      currentIndexFile,
      JSON.stringify([
        { slug: "post-a", thumbnail: OLD_THUMBNAIL },
        { slug: "post-b", thumbnail: postBThumbnail },
      ]),
      "utf8",
    );
    const generateImage = vi.fn(async () => PNG_BYTES);

    await generateBlogThumbnailsInBundle({
      currentIndexFile,
      generateImage,
      outDir,
      postsDir,
      regenerate: true,
      slug: "post-a",
    });

    const index = JSON.parse(await readFile(join(outDir, "index.json"), "utf8"));
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(index.find((entry: { slug: string }) => entry.slug === "post-a").thumbnail.url).not.toBe(
      OLD_THUMBNAIL.url,
    );
    expect(index.find((entry: { slug: string }) => entry.slug === "post-b").thumbnail).toEqual(
      postBThumbnail,
    );
  });

  it("passes a custom model slug into bundle image generation", async () => {
    const { outDir, postsDir } = await makeBundle([
      { slug: "post-a", title: "Post A", date: null, description: "A post.", thumbnail: null },
    ]);
    const generateImage = vi.fn(async () => PNG_BYTES);

    await generateBlogThumbnailsInBundle({
      generateImage,
      model: "flux-2-dev",
      outDir,
      postsDir,
    });

    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ model: "flux-2-dev" }));
  });

  it("reports the generated prompt before requesting an image", async () => {
    const { outDir, postsDir } = await makeBundle([
      { slug: "post-a", title: "Post A", date: null, description: "A post.", thumbnail: null },
    ]);
    const generateImage = vi.fn(async () => PNG_BYTES);
    const onPrompt = vi.fn();

    await generateBlogThumbnailsInBundle({
      generateImage,
      model: "flux-2-dev",
      onPrompt,
      outDir,
      postsDir,
    });

    expect(onPrompt).toHaveBeenCalledWith({
      model: "flux-2-dev",
      prompt: expect.stringContaining("Title: Post A"),
      slug: "post-a",
      title: "Post A",
    });
    expect(generateImage.mock.invocationCallOrder[0]).toBeGreaterThan(
      onPrompt.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("rejects invalid custom model slugs before generation", async () => {
    const { outDir, postsDir } = await makeBundle([
      { slug: "post-a", title: "Post A", date: null, description: "A post.", thumbnail: null },
    ]);
    const generateImage = vi.fn(async () => PNG_BYTES);

    await expect(
      generateBlogThumbnailsInBundle({
        generateImage,
        model: "@cf/black-forest-labs/flux-2-dev",
        outDir,
        postsDir,
      }),
    ).rejects.toThrow(/bare Black Forest Labs model slug/);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("uses the default Cloudflare Black Forest Labs model URL", async () => {
    const fetchImpl = vi.fn(async () => cloudflareImageResponse());

    await expect(
      runCloudflareImageGeneration({
        accountId: "test-account",
        apiToken: "test-token",
        fetchImpl,
        prompt: "Generate a thumbnail",
      }),
    ).resolves.toEqual(PNG_BYTES);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/black-forest-labs/flux-2-klein-9b",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses a custom Cloudflare Black Forest Labs model URL", async () => {
    const fetchImpl = vi.fn(async () => cloudflareImageResponse());

    await runCloudflareImageGeneration({
      accountId: "test-account",
      apiToken: "test-token",
      fetchImpl,
      model: "flux-2-dev",
      prompt: "Generate a thumbnail",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/black-forest-labs/flux-2-dev",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects regenerate requests without exactly one valid slug", async () => {
    const { outDir, postsDir } = await makeBundle([
      { slug: "post-a", title: "Post A", date: null, description: "A post.", thumbnail: null },
    ]);

    await expect(
      generateBlogThumbnailsInBundle({
        generateImage: vi.fn(async () => PNG_BYTES),
        outDir,
        postsDir,
        regenerate: true,
      }),
    ).rejects.toThrow(/requires exactly one blog slug/);

    await expect(
      generateBlogThumbnailsInBundle({
        generateImage: vi.fn(async () => PNG_BYTES),
        outDir,
        postsDir,
        regenerate: true,
        slug: "post-a,post-b",
      }),
    ).rejects.toThrow(/Invalid regenerate thumbnail slug/);
  });
});
