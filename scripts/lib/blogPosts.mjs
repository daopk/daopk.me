import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export const DEFAULT_AUTHOR = "daopk";
export const SLUG_PATTERN = /^[a-z0-9-]+$/;
export const DESCRIPTION_LIMIT = 170;

const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function unquoteScalar(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return (quote === `"` || quote === "'") && trimmed.endsWith(quote)
    ? trimmed.slice(1, -1)
    : trimmed;
}

export function validDate(value) {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

export function formatPostDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

export function titleFromSlug(slug) {
  return slug
    .split("-")
    .map((part) => (part.length === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

export function firstMarkdownH1(source) {
  const match = /^#\s+(.+?)\s*#*\s*$/m.exec(source);
  return match?.[1]?.trim() || null;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function plainTextFromMarkdown(source) {
  return normalizeWhitespace(
    source
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/[*_~#>]/g, " "),
  );
}

export function truncateDescription(value) {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= DESCRIPTION_LIMIT) {
    return normalized;
  }

  const truncated = normalized.slice(0, DESCRIPTION_LIMIT + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  const base =
    lastSpace > 90 ? truncated.slice(0, lastSpace) : normalized.slice(0, DESCRIPTION_LIMIT);
  return `${base.trim()}...`;
}

export function parsePostSource(slug, source) {
  const match = FRONTMATTER_PATTERN.exec(source);
  const frontmatter = {};
  const body = match ? source.slice(match[0].length) : source;

  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator === -1) {
        continue;
      }

      const key = line.slice(0, separator).trim();
      const value = unquoteScalar(line.slice(separator + 1));
      frontmatter[key] = value;
    }
  }

  const date = frontmatter.date === undefined ? null : validDate(frontmatter.date);
  const title = frontmatter.title?.trim() || firstMarkdownH1(body) || titleFromSlug(slug);
  const description = truncateDescription(frontmatter.description || plainTextFromMarkdown(body));

  return {
    body,
    metadata: {
      author: frontmatter.author?.trim() || DEFAULT_AUTHOR,
      date,
      description,
      formattedDate: date === null ? null : formatPostDate(date),
      title,
    },
  };
}

export function comparePostsNewestFirst(a, b) {
  if (a.metadata.date !== b.metadata.date) {
    if (a.metadata.date === null) {
      return 1;
    }
    if (b.metadata.date === null) {
      return -1;
    }
    return b.metadata.date.localeCompare(a.metadata.date);
  }

  return a.slug.localeCompare(b.slug);
}

/**
 * Read every `*.md` file in `postsDir`, parse its frontmatter/body, and return
 * the parsed posts. Throws on slugs that fall outside `SLUG_PATTERN` so the
 * build fails loudly instead of shipping an unroutable permalink.
 */
export async function readBlogPosts(postsDir) {
  const files = (await readdir(postsDir)).filter((file) => file.endsWith(".md")).sort();
  const posts = [];

  for (const file of files) {
    const slug = basename(file, ".md");

    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(`Invalid blog post slug "${slug}". Slugs must match ${SLUG_PATTERN}.`);
    }

    const source = await readFile(join(postsDir, file), "utf8");
    const parsed = parsePostSource(slug, source);
    posts.push({ slug, source, body: parsed.body, metadata: parsed.metadata });
  }

  return posts;
}
