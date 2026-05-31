import { computed, onMounted, onUnmounted, ref } from "vue";

import type { BlogContentSource } from "~/core/blog/blogContentSource";
import { formatBlogDate, validBlogDate } from "~/core/blog/blogDate";
import { debugWarn } from "~/core/debug";
import { createMarkdownRenderer } from "~/core/markdown/createMarkdownRenderer";
import type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";
import { isBlogPostSlug } from "~/core/routing/blogPaths";

export interface BlogLaunchArgs {
  readonly slug?: unknown;
  readonly path?: unknown;
}

export type BlogPostStatus = "idle" | "loading" | "ready" | "not-found" | "error";

export interface BlogPostOptions {
  readonly args?: BlogLaunchArgs;
  readonly createRenderer?: () => Promise<MarkdownRenderer>;
  readonly source: Pick<BlogContentSource, "readPostCache" | "fetchPost">;
}

export interface BlogPostMetadata {
  readonly date: string | null;
  readonly description: string | null;
  readonly formattedDate: string | null;
  readonly title: string | null;
}

interface ParsedBlogPost {
  readonly body: string;
  readonly metadata: BlogPostMetadata;
}

const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const EMPTY_METADATA: BlogPostMetadata = Object.freeze({
  date: null,
  description: null,
  formattedDate: null,
  title: null,
});

function stringArg(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resolveSlug(args: BlogLaunchArgs | undefined): string | null {
  const slug = stringArg(args?.slug);
  return slug !== null && isBlogPostSlug(slug) ? slug : null;
}

function unquoteScalar(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return (quote === `"` || quote === "'") && trimmed.endsWith(quote)
    ? trimmed.slice(1, -1)
    : trimmed;
}

export function parseBlogPostSource(source: string): ParsedBlogPost {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) {
    return { body: source, metadata: EMPTY_METADATA };
  }

  let date: string | null = null;
  let description: string | null = null;
  let title: string | null = null;

  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = unquoteScalar(line.slice(separator + 1));
    if (key === "date") {
      date = validBlogDate(value);
    } else if (key === "description") {
      description = value.length > 0 ? value : null;
    } else if (key === "title") {
      title = value.length > 0 ? value : null;
    }
  }

  return {
    body: source.slice(match[0].length),
    metadata: {
      date,
      description,
      formattedDate: date === null ? null : formatBlogDate(date),
      title,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function postDateHtml(metadata: BlogPostMetadata): string {
  if (metadata.date === null || metadata.formattedDate === null) {
    return "";
  }

  return `<p class="blog__date"><time datetime="${escapeHtml(
    metadata.date,
  )}">${escapeHtml(metadata.formattedDate)}</time></p>`;
}

function stripLeadingH1(html: string): string {
  return html.replace(/^<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>\s*/i, "");
}

function decoratePostHtml(html: string, metadata: BlogPostMetadata): string {
  const dateHtml = postDateHtml(metadata);

  if (metadata.title !== null) {
    return `<h1>${escapeHtml(metadata.title)}</h1>${dateHtml}${stripLeadingH1(html)}`;
  }

  if (dateHtml.length === 0) {
    return html;
  }

  const h1CloseIndex = html.search(/<\/h1>/i);
  if (h1CloseIndex === -1) {
    return `${dateHtml}${html}`;
  }

  const insertIndex = h1CloseIndex + "</h1>".length;
  return `${html.slice(0, insertIndex)}${dateHtml}${html.slice(insertIndex)}`;
}

export function useBlogPost({
  args,
  createRenderer = createMarkdownRenderer,
  source: contentSource,
}: BlogPostOptions) {
  const html = ref("");
  const metadata = ref<BlogPostMetadata>(EMPTY_METADATA);
  const status = ref<BlogPostStatus>("idle");
  const source = ref("");

  const slug = ref<string | null>(resolveSlug(args));

  const notFound = computed(() => status.value === "not-found");
  const loadFailed = computed(() => status.value === "error");

  let disposed = false;
  let refreshRun = 0;
  let renderer: MarkdownRenderer | undefined;
  let rendererPromise: Promise<MarkdownRenderer> | undefined;

  async function getRenderer(): Promise<MarkdownRenderer> {
    if (renderer) {
      return renderer;
    }

    rendererPromise ??= createRenderer();
    const next = await rendererPromise;

    if (disposed) {
      next.dispose();
      throw new Error("Blog markdown renderer resolved after dispose.");
    }

    renderer = next;
    return next;
  }

  async function renderSource(markdown: string, run: number): Promise<void> {
    const parsed = parseBlogPostSource(markdown);
    const activeRenderer = await getRenderer();
    const result = await activeRenderer.render(parsed.body);

    if (disposed || run !== refreshRun) {
      return;
    }

    source.value = markdown;
    metadata.value = parsed.metadata;
    html.value = decoratePostHtml(result.html, parsed.metadata);
    status.value = "ready";
  }

  async function refresh(): Promise<void> {
    const run = ++refreshRun;
    html.value = "";
    metadata.value = EMPTY_METADATA;
    source.value = "";

    const currentSlug = slug.value;
    if (currentSlug === null) {
      status.value = "not-found";
      return;
    }

    status.value = "loading";

    let cached: string | null = null;
    try {
      cached = await contentSource.readPostCache(currentSlug);
    } catch (error) {
      debugWarn("[blog] failed to read cached blog post", error);
    }

    if (disposed || run !== refreshRun) {
      return;
    }

    if (cached !== null) {
      await renderSource(cached, run);
      if (disposed || run !== refreshRun) {
        return;
      }
    }

    try {
      const fresh = await contentSource.fetchPost(currentSlug);
      if (disposed || run !== refreshRun) {
        return;
      }

      if (fresh === null) {
        // Remote 404: nothing cached means the post does not exist; an existing
        // cache keeps rendering (post may have been unpublished while cached).
        if (cached === null) {
          status.value = "not-found";
        }
        return;
      }

      if (fresh !== cached) {
        await renderSource(fresh, run);
      }
    } catch (error) {
      if (disposed || run !== refreshRun) {
        return;
      }
      if (cached !== null) {
        debugWarn("[blog] serving cached blog post; refresh failed", error);
        return;
      }
      debugWarn("[blog] failed to load or render blog post", error);
      status.value = "error";
    }
  }

  function open(nextArgs: BlogLaunchArgs | undefined): void {
    slug.value = resolveSlug(nextArgs);
    void refresh();
  }

  function dispose(): void {
    disposed = true;
    refreshRun += 1;
    renderer?.dispose();
    renderer = undefined;
  }

  onMounted(() => {
    void refresh();
  });

  onUnmounted(() => {
    dispose();
  });

  return {
    dispose,
    html,
    loadFailed,
    metadata,
    notFound,
    open,
    refresh,
    slug,
    source,
    status,
  };
}
