import { computed, onMounted, onUnmounted, ref } from "vue";

import { debugWarn } from "~/core/debug";
import { createMarkdownRenderer } from "~/core/markdown/createMarkdownRenderer";
import type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";
import { blogPostPathFromSlug } from "~/core/routing/blogPaths";
import { VfsError } from "~/core/vfs/errors";

export interface BlogLaunchArgs {
  readonly slug?: unknown;
  readonly path?: unknown;
}

export type BlogPostStatus = "idle" | "loading" | "ready" | "not-found" | "error";

export interface BlogPostOptions {
  readonly args?: BlogLaunchArgs;
  readonly createRenderer?: () => Promise<MarkdownRenderer>;
  readonly readText: (path: string) => Promise<string | null>;
}

export interface BlogPostMetadata {
  readonly date: string | null;
  readonly formattedDate: string | null;
  readonly title: string | null;
}

interface ParsedBlogPost {
  readonly body: string;
  readonly metadata: BlogPostMetadata;
}

const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_METADATA: BlogPostMetadata = Object.freeze({
  date: null,
  formattedDate: null,
  title: null,
});

function stringArg(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resolveBlogPath(args: BlogLaunchArgs | undefined): {
  readonly path: string | null;
  readonly slug: string | null;
} {
  const slug = stringArg(args?.slug);
  if (slug === null) {
    return { path: null, slug: null };
  }

  const canonicalPath = blogPostPathFromSlug(slug);
  const requestedPath = stringArg(args?.path);
  return {
    slug,
    path: requestedPath === canonicalPath ? requestedPath : canonicalPath,
  };
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof VfsError && (error.code === "NOT_FOUND" || error.code === "MOUNT_NOT_FOUND")
  );
}

function unquoteScalar(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return (quote === `"` || quote === "'") && trimmed.endsWith(quote)
    ? trimmed.slice(1, -1)
    : trimmed;
}

function validDate(value: string): string | null {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

function formatPostDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

export function parseBlogPostSource(source: string): ParsedBlogPost {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) {
    return { body: source, metadata: EMPTY_METADATA };
  }

  let date: string | null = null;
  let title: string | null = null;

  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = unquoteScalar(line.slice(separator + 1));
    if (key === "date") {
      date = validDate(value);
    } else if (key === "title") {
      title = value.length > 0 ? value : null;
    }
  }

  return {
    body: source.slice(match[0].length),
    metadata: {
      date,
      formattedDate: date === null ? null : formatPostDate(date),
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
  readText,
}: BlogPostOptions) {
  const html = ref("");
  const metadata = ref<BlogPostMetadata>(EMPTY_METADATA);
  const status = ref<BlogPostStatus>("idle");
  const source = ref("");

  const resolved = resolveBlogPath(args);
  const slug = ref<string | null>(resolved.slug);
  const path = ref<string | null>(resolved.path);

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

  async function refresh(): Promise<void> {
    const run = ++refreshRun;
    html.value = "";
    metadata.value = EMPTY_METADATA;
    source.value = "";

    if (path.value === null) {
      status.value = "not-found";
      return;
    }

    status.value = "loading";

    try {
      const markdown = await readText(path.value);

      if (disposed || run !== refreshRun) {
        return;
      }

      if (markdown === null) {
        status.value = "not-found";
        return;
      }

      source.value = markdown;
      const parsed = parseBlogPostSource(markdown);
      const activeRenderer = await getRenderer();
      const result = await activeRenderer.render(parsed.body);

      if (disposed || run !== refreshRun) {
        return;
      }

      metadata.value = parsed.metadata;
      html.value = decoratePostHtml(result.html, parsed.metadata);
      status.value = "ready";
    } catch (error) {
      if (disposed || run !== refreshRun) {
        return;
      }

      if (isNotFoundError(error)) {
        status.value = "not-found";
        return;
      }

      debugWarn("[blog] failed to load or render VFS markdown", error);
      status.value = "error";
    }
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
    path,
    refresh,
    slug,
    source,
    status,
  };
}
