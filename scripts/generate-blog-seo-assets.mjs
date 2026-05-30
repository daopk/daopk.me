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
const SEO_BLOG_INDEX_FILE = join(DIST_DIR, "__seo/blog-index.html");
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
    <meta name="x-daopk-seo-asset" content="blog-post" />
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

function comparePostsNewestFirst(a, b) {
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

function buildIndexDocument(posts) {
  const canonicalUrl = `${SITE_ORIGIN}/blog`;
  const description = `Latest posts from ${SITE_NAME}.`;
  const listItems = posts
    .map((post) => {
      const href = `/blog/${post.slug}`;
      const dateHtml =
        post.metadata.date === null || post.metadata.formattedDate === null
          ? ""
          : `<p class="post-list__date"><time datetime="${escapeHtml(
              post.metadata.date,
            )}">${escapeHtml(post.metadata.formattedDate)}</time></p>`;

      return `<li class="post-list__item">
          <a class="post-list__link" href="${escapeHtml(href)}">
            ${dateHtml}
            <span class="post-list__title">${escapeHtml(post.metadata.title)}</span>
            <span class="post-list__description">${escapeHtml(post.metadata.description)}</span>
          </a>
        </li>`;
    })
    .join("\n");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    description,
    inLanguage: "en",
    name: SITE_NAME,
    url: canonicalUrl,
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      datePublished: post.metadata.date ?? undefined,
      description: post.metadata.description,
      headline: post.metadata.title,
      url: `${SITE_ORIGIN}/blog/${post.slug}`,
    })),
  };

  for (const post of jsonLd.blogPost) {
    for (const key of Object.keys(post)) {
      if (post[key] === undefined) {
        delete post[key];
      }
    }
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Blog | ${escapeHtml(SITE_NAME)}</title>
    <meta name="x-daopk-seo-asset" content="blog-index" />
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="Blog" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Blog" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
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
        max-width: 760px;
        padding: 56px 24px 72px;
      }

      .site {
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
        margin: 0 0 32px;
      }

      .post-list {
        display: grid;
        gap: 14px;
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .post-list__link {
        border: 1px solid rgb(32 31 36 / 12%);
        border-radius: 8px;
        color: inherit;
        display: grid;
        gap: 8px;
        padding: 18px;
        text-decoration: none;
      }

      .post-list__link:hover,
      .post-list__link:focus-visible {
        border-color: #5a2d82;
      }

      .post-list__date {
        color: #635f6d;
        font-size: 0.85rem;
        margin: 0;
      }

      .post-list__title {
        font-size: 1.25rem;
        font-weight: 700;
        line-height: 1.25;
      }

      .post-list__description {
        color: #635f6d;
        line-height: 1.6;
      }

      @media (prefers-color-scheme: dark) {
        body {
          background: #17151c;
          color: #f5f1fb;
        }

        .site,
        .post-list__date,
        .post-list__description {
          color: #b7afc3;
        }

        .post-list__link {
          border-color: rgb(245 241 251 / 16%);
        }

        .post-list__link:hover,
        .post-list__link:focus-visible {
          border-color: #caa8ff;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <p class="site">${escapeHtml(SITE_NAME)}</p>
      <h1>Latest posts</h1>
      <ol class="post-list">
        ${listItems}
      </ol>
    </main>
  </body>
</html>
`;
}

function buildSitemap(posts) {
  const latestPostDate = posts.find((post) => post.metadata.date !== null)?.metadata.date ?? null;
  const indexLastmod = latestPostDate === null ? "" : `\n    <lastmod>${latestPostDate}</lastmod>`;
  const indexEntry = `  <url>\n    <loc>${escapeHtml(SITE_ORIGIN)}/blog</loc>${indexLastmod}\n  </url>`;
  const postEntries = posts
    .map((post) => {
      const loc = `${SITE_ORIGIN}/blog/${post.slug}`;
      const lastmod = post.metadata.date ? `\n    <lastmod>${post.metadata.date}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeHtml(loc)}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");
  const entries = [indexEntry, postEntries].filter((entry) => entry.length > 0).join("\n");

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

  const sortedPosts = [...posts].sort(comparePostsNewestFirst);

  await writeTextFile(SEO_BLOG_INDEX_FILE, buildIndexDocument(sortedPosts));
  await writeTextFile(join(DIST_DIR, "sitemap.xml"), buildSitemap(sortedPosts));
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
