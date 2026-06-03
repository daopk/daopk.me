import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  escapeHtml,
  parsePostSource,
  plainTextFromMarkdown,
  SLUG_PATTERN,
  truncateDescription,
} from "./blogPosts.mjs";

export const BLOG_THUMBNAIL_WIDTH = 1024;
export const BLOG_THUMBNAIL_HEIGHT = 576;
export const BLOG_THUMBNAIL_BASE_PATH = "/_worker/blog/thumbnails";
export const BLOG_THUMBNAIL_R2_PREFIX = "thumbnails";
export const BLOG_THUMBNAIL_DEFAULT_MODEL = "flux-2-klein-9b";
export const CLOUDFLARE_IMAGE_MODEL_PREFIX = "@cf/black-forest-labs/";

const SITE_ORIGIN = "https://daopk.me";
const IMAGE_HASH_PATTERN = /^[a-f0-9]{64}$/;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const MODEL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "1";
}

function firstNonEmptyString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

export function normalizeCloudflareImageModel(model = BLOG_THUMBNAIL_DEFAULT_MODEL) {
  const normalized = firstNonEmptyString(model, BLOG_THUMBNAIL_DEFAULT_MODEL);

  if (!MODEL_SLUG_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid blog thumbnail model "${normalized}". Use a bare Black Forest Labs model slug such as "${BLOG_THUMBNAIL_DEFAULT_MODEL}".`,
    );
  }

  return normalized;
}

export function cloudflareImageModelId(model = BLOG_THUMBNAIL_DEFAULT_MODEL) {
  return `${CLOUDFLARE_IMAGE_MODEL_PREFIX}${normalizeCloudflareImageModel(model)}`;
}

function jsonLdScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function absoluteThumbnailUrl(thumbnail) {
  return new URL(thumbnail.url, SITE_ORIGIN).href;
}

async function readJsonArrayIfExists(file) {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function assertIndexEntry(value) {
  if (!isRecord(value) || typeof value.slug !== "string" || !SLUG_PATTERN.test(value.slug)) {
    throw new Error(`Invalid blog index entry: ${JSON.stringify(value)}`);
  }

  return {
    ...value,
    thumbnail: isBlogThumbnail(value.thumbnail, value.slug) ? value.thumbnail : null,
  };
}

export function isBlogThumbnail(value, slug) {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.url !== "string" ||
    typeof value.alt !== "string" ||
    value.alt.trim().length === 0 ||
    value.width !== BLOG_THUMBNAIL_WIDTH ||
    value.height !== BLOG_THUMBNAIL_HEIGHT
  ) {
    return false;
  }

  const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^${BLOG_THUMBNAIL_BASE_PATH}/${escapedSlug}/([a-f0-9]{64})\\.(jpe?g|png|webp)$`,
    "i",
  );
  const match = pattern.exec(value.url);
  if (match === null) {
    return false;
  }

  return (
    IMAGE_HASH_PATTERN.test(match[1].toLowerCase()) && IMAGE_EXTENSIONS.has(match[2].toLowerCase())
  );
}

export function validateRegenerateSlug({ entries, regenerate, slug }) {
  if (!normalizeBoolean(regenerate)) {
    return null;
  }

  const normalizedSlug = typeof slug === "string" ? slug.trim() : "";
  if (normalizedSlug.length === 0) {
    throw new Error("regenerate_thumbnail=true requires exactly one blog slug.");
  }

  if (!SLUG_PATTERN.test(normalizedSlug)) {
    throw new Error(`Invalid regenerate thumbnail slug "${normalizedSlug}".`);
  }

  if (!entries.some((entry) => entry.slug === normalizedSlug)) {
    throw new Error(`Cannot regenerate thumbnail for missing blog post "${normalizedSlug}".`);
  }

  return normalizedSlug;
}

export function mergeReusableThumbnails(entries, currentEntries, regenerateSlug = null) {
  const currentBySlug = new Map();
  for (const entry of currentEntries) {
    if (
      isRecord(entry) &&
      typeof entry.slug === "string" &&
      isBlogThumbnail(entry.thumbnail, entry.slug)
    ) {
      currentBySlug.set(entry.slug, entry.thumbnail);
    }
  }

  return entries.map((entry) => {
    const reusableThumbnail = currentBySlug.get(entry.slug) ?? null;
    return {
      ...entry,
      thumbnail: entry.slug === regenerateSlug ? null : reusableThumbnail,
    };
  });
}

export function detectImageFormat(bytes) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { contentType: "image/png", extension: "png" };
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }

  throw new Error("Cloudflare AI returned an unsupported thumbnail image format.");
}

export function createThumbnailMetadata({ bytes, slug, title }) {
  const format = detectImageFormat(bytes);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const key = `${BLOG_THUMBNAIL_R2_PREFIX}/${slug}/${hash}.${format.extension}`;

  return {
    contentType: format.contentType,
    key,
    thumbnail: {
      url: `${BLOG_THUMBNAIL_BASE_PATH}/${slug}/${hash}.${format.extension}`,
      width: BLOG_THUMBNAIL_WIDTH,
      height: BLOG_THUMBNAIL_HEIGHT,
      alt: `${title} thumbnail`,
    },
  };
}

export function buildThumbnailPrompt({ body, description, thumbnailPrompt, title }) {
  if (typeof thumbnailPrompt === "string" && thumbnailPrompt.trim().length > 0) {
    return `${thumbnailPrompt.trim()}\n\nNo text, no logos, no UI labels.`;
  }

  const excerpt = truncateDescription(description || plainTextFromMarkdown(body));
  return [
    "Create a 16:9 editorial blog thumbnail.",
    "Make it visually specific, polished, and suitable for a technical personal blog.",
    "Do not include text, logos, watermarks, UI labels, or readable writing.",
    "Reference the blog post title and content for thematic inspiration, but do not directly depict specific scenes or characters from the post.",
    `Title: ${title}`,
    excerpt.length > 0 ? `Context: ${excerpt}` : "",
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

export async function runCloudflareImageGeneration({
  accountId,
  apiToken,
  fetchImpl = globalThis.fetch,
  height = BLOG_THUMBNAIL_HEIGHT,
  model = BLOG_THUMBNAIL_DEFAULT_MODEL,
  prompt,
  width = BLOG_THUMBNAIL_WIDTH,
}) {
  if (typeof accountId !== "string" || accountId.trim().length === 0) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required to generate blog thumbnails.");
  }
  if (typeof apiToken !== "string" || apiToken.trim().length === 0) {
    throw new Error(
      "CLOUDFLARE_AI_API_TOKEN or CLOUDFLARE_API_TOKEN is required to generate blog thumbnails.",
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable in this environment.");
  }

  const modelId = cloudflareImageModelId(model);
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(width));
  form.append("height", String(height));

  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      accountId,
    )}/ai/run/${modelId}`,
    {
      body: form,
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Cloudflare AI thumbnail request failed (${response.status}): ${await response.text()}`,
    );
  }

  const data = await response.json();
  const image = data?.result?.image ?? data?.image;
  if (typeof image !== "string" || image.length === 0) {
    throw new Error("Cloudflare AI thumbnail response did not include result.image.");
  }

  return Buffer.from(image, "base64");
}

function applyPostThumbnailSeo(html, thumbnail, title) {
  const absoluteUrl = absoluteThumbnailUrl(thumbnail);
  const imageMeta = [
    `<meta property="og:image" content="${escapeHtml(absoluteUrl)}" />`,
    `<meta property="og:image:width" content="${thumbnail.width}" />`,
    `<meta property="og:image:height" content="${thumbnail.height}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(thumbnail.alt)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(absoluteUrl)}" />`,
    `<meta name="twitter:image:alt" content="${escapeHtml(thumbnail.alt)}" />`,
  ].join("\n    ");

  let next = html.replace(
    /<meta name="twitter:card" content="summary" \/>/,
    '<meta name="twitter:card" content="summary_large_image" />',
  );

  if (!next.includes('property="og:image"')) {
    next = next.replace(/(<meta property="og:url" content="[^"]*" \/>)/, `$1\n    ${imageMeta}`);
  }

  next = next.replace(
    /<script type="application\/ld\+json">([^<]*)<\/script>/,
    (match, rawJson) => {
      try {
        const jsonLd = JSON.parse(rawJson);
        jsonLd.image = absoluteUrl;
        return `<script type="application/ld+json">${jsonLdScript(jsonLd)}</script>`;
      } catch {
        return match;
      }
    },
  );

  if (!next.includes(`content="${escapeHtml(thumbnail.alt)}"`)) {
    next = next.replace(
      "</head>",
      `    <meta property="og:image:alt" content="${escapeHtml(`${title} thumbnail`)}" />\n  </head>`,
    );
  }

  return next;
}

async function patchPostSeoFile({ outDir, slug, thumbnail, title }) {
  const file = join(outDir, "seo/posts", `${slug}.html`);
  const html = await readFile(file, "utf8");
  await writeFile(file, applyPostThumbnailSeo(html, thumbnail, title), "utf8");
}

async function writeGeneratedThumbnail({ bytes, metadata, outDir }) {
  const path = join(outDir, metadata.key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

async function postPromptData(postsDir, entry) {
  const source = await readFile(join(postsDir, `${entry.slug}.md`), "utf8");
  const parsed = parsePostSource(entry.slug, source);
  return {
    body: parsed.body,
    description: entry.description ?? parsed.metadata.description,
    thumbnailPrompt: parsed.metadata.thumbnailPrompt,
    title: entry.title ?? parsed.metadata.title,
  };
}

export async function generateBlogThumbnailsInBundle({
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = firstNonEmptyString(
    process.env.CLOUDFLARE_AI_API_TOKEN,
    process.env.CLOUDFLARE_API_TOKEN,
  ),
  currentIndexFile,
  fetchImpl = globalThis.fetch,
  generateImage,
  model = firstNonEmptyString(process.env.BLOG_THUMBNAIL_MODEL, BLOG_THUMBNAIL_DEFAULT_MODEL),
  onPrompt,
  outDir,
  postsDir,
  regenerate = false,
  slug = "",
}) {
  const indexFile = join(outDir, "index.json");
  const entries = JSON.parse(await readFile(indexFile, "utf8")).map(assertIndexEntry);
  const currentEntries =
    currentIndexFile === undefined ? [] : await readJsonArrayIfExists(currentIndexFile);
  const regenerateSlug = validateRegenerateSlug({ entries, regenerate, slug });
  const thumbnailModel = normalizeCloudflareImageModel(model);
  const mergedEntries = mergeReusableThumbnails(entries, currentEntries, regenerateSlug);
  const nextEntries = [];
  let generated = 0;
  let reused = 0;

  for (const entry of mergedEntries) {
    let thumbnail = entry.thumbnail;
    if (thumbnail !== null) {
      reused += 1;
    }

    const shouldGenerate =
      regenerateSlug === null ? thumbnail === null : entry.slug === regenerateSlug;
    if (shouldGenerate) {
      const promptData = await postPromptData(postsDir, entry);
      const prompt = buildThumbnailPrompt(promptData);
      if (typeof onPrompt === "function") {
        onPrompt({ model: thumbnailModel, prompt, slug: entry.slug, title: promptData.title });
      }
      const bytes = await (generateImage ?? runCloudflareImageGeneration)({
        accountId,
        apiToken,
        fetchImpl,
        height: BLOG_THUMBNAIL_HEIGHT,
        model: thumbnailModel,
        prompt,
        slug: entry.slug,
        width: BLOG_THUMBNAIL_WIDTH,
      });
      const metadata = createThumbnailMetadata({
        bytes,
        slug: entry.slug,
        title: promptData.title,
      });
      await writeGeneratedThumbnail({ bytes, metadata, outDir });
      thumbnail = metadata.thumbnail;
      generated += 1;
    }

    const nextEntry = { ...entry, thumbnail };
    nextEntries.push(nextEntry);
    if (thumbnail !== null) {
      await patchPostSeoFile({
        outDir,
        slug: entry.slug,
        thumbnail,
        title: nextEntry.title ?? entry.slug,
      });
    }
  }

  await writeFile(indexFile, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf8");
  return { generated, reused, total: nextEntries.length };
}
