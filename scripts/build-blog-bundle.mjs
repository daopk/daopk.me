/**
 * Builds the publish bundle that CI uploads to the Cloudflare R2 blog bucket.
 *
 * Output layout (mirrors the keys worker/router.ts reads):
 *   blog-dist/index.json            -> runtime manifest for the blog index list
 *   blog-dist/posts/<slug>.md       -> raw markdown the app fetches per post
 *   blog-dist/thumbnails/*          -> generated social/list thumbnails
 *   blog-dist/seo/blog-index.html   -> prerendered index for crawlers
 *   blog-dist/seo/posts/<slug>.html -> prerendered post for crawlers
 *   blog-dist/sitemap.xml           -> sitemap served at /sitemap.xml
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { comparePostsNewestFirst, escapeHtml, readBlogPosts } from "./lib/blogPosts.mjs";

const SITE_ORIGIN = "https://daopk.me";
const SITE_NAME = "daopk.me";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const POSTS_DIR = join(ROOT, "blog");
const OUT_DIR = join(ROOT, "blog-dist");
const POSTS_OUT_DIR = join(OUT_DIR, "posts");
const SEO_BLOG_DIR = join(OUT_DIR, "seo/posts");
const SEO_BLOG_INDEX_FILE = join(OUT_DIR, "seo/blog-index.html");
const INDEX_FILE = join(OUT_DIR, "index.json");
const SITEMAP_FILE = join(OUT_DIR, "sitemap.xml");

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
    dateModified: metadata.updated ?? metadata.date ?? undefined,
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
  // Effective last-modified of a post is its `updated` date when present (a
  // meaningful edit), otherwise its publish `date`. The blog index reflects the
  // freshest of all posts so Google reprioritizes it when anything changes.
  const latestLastmod =
    posts
      .map((post) => post.metadata.updated ?? post.metadata.date)
      .filter((date) => date !== null)
      .sort()
      .at(-1) ?? null;
  const homeEntry = `  <url>\n    <loc>${escapeHtml(SITE_ORIGIN)}/</loc>\n  </url>`;
  const indexLastmod = latestLastmod === null ? "" : `\n    <lastmod>${latestLastmod}</lastmod>`;
  const indexEntry = `  <url>\n    <loc>${escapeHtml(SITE_ORIGIN)}/blog</loc>${indexLastmod}\n  </url>`;
  const postEntries = posts
    .map((post) => {
      const loc = `${SITE_ORIGIN}/blog/${post.slug}`;
      const lastmodDate = post.metadata.updated ?? post.metadata.date;
      const lastmod = lastmodDate ? `\n    <lastmod>${lastmodDate}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeHtml(loc)}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");
  const entries = [homeEntry, indexEntry, postEntries]
    .filter((entry) => entry.length > 0)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

async function writeTextFile(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function main() {
  const parsedPosts = await readBlogPosts(POSTS_DIR);
  const posts = [];

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(SEO_BLOG_DIR, { recursive: true });
  await mkdir(POSTS_OUT_DIR, { recursive: true });

  for (const post of parsedPosts) {
    await writeTextFile(join(POSTS_OUT_DIR, `${post.slug}.md`), post.source);

    const html = await renderMarkdownToHtml(post.body);
    const document = buildPostDocument({ html, metadata: post.metadata, slug: post.slug });
    await writeTextFile(join(SEO_BLOG_DIR, `${post.slug}.html`), document);

    posts.push({ slug: post.slug, metadata: post.metadata });
  }

  const sortedPosts = [...posts].sort(comparePostsNewestFirst);
  const index = sortedPosts.map((post) => ({
    slug: post.slug,
    title: post.metadata.title,
    date: post.metadata.date,
    description: post.metadata.description,
    thumbnail: null,
  }));

  await writeTextFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`);
  await writeTextFile(SEO_BLOG_INDEX_FILE, buildIndexDocument(sortedPosts));
  await writeTextFile(SITEMAP_FILE, buildSitemap(sortedPosts));

  console.log(
    `Built blog bundle (${posts.length} post${posts.length === 1 ? "" : "s"}) -> blog-dist/`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
