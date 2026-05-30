import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const SITE_ORIGIN = "https://daopk.me";
const SITE_NAME = "daopk.me";
const DEFAULT_AUTHOR = "daopk";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const POSTS_DIR = join(ROOT, "src/content/posts");
const DIST_DIR = join(ROOT, "dist");
const SEO_BLOG_DIR = join(DIST_DIR, "__seo/blog");
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const markdownSanitizeSchema = {
  allowComments: false,
  allowDoctypes: false,
  ancestors: {
    tbody: ["table"],
    td: ["tr"],
    th: ["tr"],
    thead: ["table"],
    tr: ["table", "thead", "tbody"],
  },
  attributes: {
    "*": [],
    a: ["href", "title"],
    code: [["className", /^language-[A-Za-z0-9_+-]+$/]],
    img: ["src", "alt", "title"],
    input: [
      ["type", "checkbox"],
      ["disabled", true],
      ["checked", true],
    ],
    li: [["className", "task-list-item"]],
    td: ["align"],
    th: ["align"],
    ul: [["className", "contains-task-list"]],
  },
  clobber: ["ariaDescribedBy", "ariaLabelledBy", "id", "name"],
  clobberPrefix: "user-content-",
  protocols: {
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
  required: {
    input: {
      disabled: true,
      type: "checkbox",
    },
  },
  strip: ["script", "style"],
  tagNames: [
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "input",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
};

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unquoteScalar(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return (quote === `"` || quote === "'") && trimmed.endsWith(quote)
    ? trimmed.slice(1, -1)
    : trimmed;
}

function validDate(value) {
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

function formatPostDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .map((part) => (part.length === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function firstMarkdownH1(source) {
  const match = /^#\s+(.+?)\s*#*\s*$/m.exec(source);
  return match?.[1]?.trim() || null;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function plainTextFromMarkdown(source) {
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

function truncateDescription(value) {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= 170) {
    return normalized;
  }

  const truncated = normalized.slice(0, 171);
  const lastSpace = truncated.lastIndexOf(" ");
  const base = lastSpace > 90 ? truncated.slice(0, lastSpace) : normalized.slice(0, 170);
  return `${base.trim()}...`;
}

function parsePostSource(slug, source) {
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

function stripLeadingH1(html) {
  return html.replace(/^<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>\s*/i, "");
}

async function renderMarkdownToHtml(source) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, markdownSanitizeSchema)
    .use(rehypeStringify)
    .process(source);

  return String(file);
}

function jsonLdScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildPostDocument({ html, metadata, slug }) {
  const canonicalUrl = `${SITE_ORIGIN}/blog/${slug}`;
  const title = metadata.title;
  const pageTitle = `${title} | ${SITE_NAME}`;
  const articleBody = stripLeadingH1(html);
  const dateHtml =
    metadata.date === null || metadata.formattedDate === null
      ? ""
      : `<p class="post__date"><time datetime="${escapeHtml(metadata.date)}">${escapeHtml(
          metadata.formattedDate,
        )}</time></p>`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    author: {
      "@type": "Person",
      name: metadata.author,
    },
    dateModified: metadata.date ?? undefined,
    datePublished: metadata.date ?? undefined,
    description: metadata.description,
    headline: title,
    inLanguage: "en",
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
  };

  for (const key of Object.keys(jsonLd)) {
    if (jsonLd[key] === undefined) {
      delete jsonLd[key];
    }
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(metadata.description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(metadata.description)}" />
    <script type="application/ld+json">${jsonLdScript(jsonLd)}</script>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        background: #f8f7fb;
        color: #201f24;
        margin: 0;
      }

      main {
        margin: 0 auto;
        max-width: 72ch;
        padding: 56px 24px 72px;
      }

      .post__site {
        color: #635f6d;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0;
        margin: 0 0 12px;
        text-transform: uppercase;
      }

      h1 {
        font-size: clamp(2rem, 5vw, 3.25rem);
        line-height: 1.08;
        margin: 0 0 12px;
      }

      .post__date {
        color: #635f6d;
        margin: 0 0 32px;
      }

      .post__body {
        font-size: 1.05rem;
        line-height: 1.72;
      }

      .post__body h2 {
        font-size: 1.45rem;
        line-height: 1.25;
        margin: 2rem 0 0.75rem;
      }

      .post__body a {
        color: #5a2d82;
      }

      .post__body code {
        background: rgb(32 31 36 / 8%);
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.9em;
        padding: 1px 5px;
      }

      .post__body pre {
        border: 1px solid rgb(32 31 36 / 12%);
        border-radius: 6px;
        overflow-x: auto;
        padding: 14px;
      }

      .post__body pre code {
        background: transparent;
        padding: 0;
      }

      @media (prefers-color-scheme: dark) {
        body {
          background: #17151c;
          color: #f5f1fb;
        }

        .post__site,
        .post__date {
          color: #b7afc3;
        }

        .post__body a {
          color: #caa8ff;
        }

        .post__body code {
          background: rgb(245 241 251 / 12%);
        }

        .post__body pre {
          border-color: rgb(245 241 251 / 16%);
        }
      }
    </style>
  </head>
  <body>
    <main>
      <article>
        <p class="post__site">${escapeHtml(SITE_NAME)}</p>
        <h1>${escapeHtml(title)}</h1>
        ${dateHtml}
        <div class="post__body">${articleBody}</div>
      </article>
    </main>
  </body>
</html>
`;
}

function buildSitemap(posts) {
  const entries = posts
    .map((post) => {
      const loc = `${SITE_ORIGIN}/blog/${post.slug}`;
      const lastmod = post.metadata.date ? `\n    <lastmod>${post.metadata.date}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeHtml(loc)}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

async function writeTextFile(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function main() {
  const files = (await readdir(POSTS_DIR)).filter((file) => file.endsWith(".md")).sort();
  const posts = [];

  await mkdir(SEO_BLOG_DIR, { recursive: true });

  for (const file of files) {
    const slug = basename(file, ".md");

    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(`Invalid blog post slug "${slug}". Slugs must match ${SLUG_PATTERN}.`);
    }

    const source = await readFile(join(POSTS_DIR, file), "utf8");
    const parsed = parsePostSource(slug, source);
    const html = await renderMarkdownToHtml(parsed.body);
    const document = buildPostDocument({ html, metadata: parsed.metadata, slug });

    await writeTextFile(join(SEO_BLOG_DIR, `${slug}.html`), document);
    posts.push({ slug, metadata: parsed.metadata });
  }

  await writeTextFile(join(DIST_DIR, "sitemap.xml"), buildSitemap(posts));
  await writeTextFile(
    join(DIST_DIR, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
  );

  console.log(`Generated ${posts.length} blog SEO page${posts.length === 1 ? "" : "s"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
