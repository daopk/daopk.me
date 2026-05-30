import { computed, onMounted, onUnmounted, ref } from "vue";

import { debugWarn } from "~/core/debug";
import { BLOG_POSTS_ROOT, isBlogPostSlug } from "~/core/routing/blogPaths";
import { VfsError, type VfsDirEntry } from "~/core/vfs";

import { parseBlogPostSource } from "./useBlogPost";

export type BlogIndexStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface BlogIndexPost {
  readonly date: string | null;
  readonly excerpt: string;
  readonly formattedDate: string | null;
  readonly path: string;
  readonly slug: string;
  readonly title: string;
}

export interface BlogIndexOptions {
  readonly list: (path: string) => Promise<readonly VfsDirEntry[] | null>;
  readonly readText: (path: string) => Promise<string | null>;
}

const POST_FILE_PATTERN = /^(.+)\.md$/;
const EXCERPT_LIMIT = 170;

function slugFromEntry(entry: VfsDirEntry): string | null {
  if (entry.kind !== "file") {
    return null;
  }

  const slug = POST_FILE_PATTERN.exec(entry.name)?.[1] ?? null;
  return slug !== null && isBlogPostSlug(slug) ? slug : null;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

function firstMarkdownH1(source: string): string | null {
  return /^#\s+(.+?)\s*#*\s*$/m.exec(source)?.[1]?.trim() || null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function plainTextFromMarkdown(source: string): string {
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

function truncateExcerpt(value: string): string {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= EXCERPT_LIMIT) {
    return normalized;
  }

  const truncated = normalized.slice(0, EXCERPT_LIMIT + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  const base = lastSpace > 90 ? truncated.slice(0, lastSpace) : normalized.slice(0, EXCERPT_LIMIT);
  return `${base.trim()}...`;
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof VfsError && (error.code === "NOT_FOUND" || error.code === "MOUNT_NOT_FOUND")
  );
}

function comparePosts(a: BlogIndexPost, b: BlogIndexPost): number {
  if (a.date !== b.date) {
    if (a.date === null) {
      return 1;
    }
    if (b.date === null) {
      return -1;
    }
    return b.date.localeCompare(a.date);
  }

  return a.slug.localeCompare(b.slug);
}

export function parseBlogIndexPost(slug: string, path: string, source: string): BlogIndexPost {
  const parsed = parseBlogPostSource(source);
  const title = parsed.metadata.title ?? firstMarkdownH1(parsed.body) ?? titleFromSlug(slug);
  const excerptSource = parsed.metadata.description ?? plainTextFromMarkdown(parsed.body);

  return {
    date: parsed.metadata.date,
    excerpt: truncateExcerpt(excerptSource),
    formattedDate: parsed.metadata.formattedDate,
    path,
    slug,
    title,
  };
}

export function useBlogIndex({ list, readText }: BlogIndexOptions) {
  const posts = ref<readonly BlogIndexPost[]>([]);
  const status = ref<BlogIndexStatus>("idle");

  const empty = computed(() => status.value === "empty");
  const loadFailed = computed(() => status.value === "error");
  const loading = computed(() => status.value === "loading");

  let disposed = false;
  let refreshRun = 0;

  async function refresh(): Promise<void> {
    const run = ++refreshRun;
    posts.value = [];
    status.value = "loading";

    try {
      const entries = await list(BLOG_POSTS_ROOT);

      if (disposed || run !== refreshRun) {
        return;
      }

      if (entries === null) {
        status.value = "empty";
        return;
      }

      const nextPosts: BlogIndexPost[] = [];
      for (const entry of entries) {
        const slug = slugFromEntry(entry);
        if (slug === null) {
          continue;
        }

        try {
          const source = await readText(entry.path);
          if (disposed || run !== refreshRun) {
            return;
          }
          if (source === null) {
            continue;
          }

          nextPosts.push(parseBlogIndexPost(slug, entry.path, source));
        } catch (error) {
          if (isNotFoundError(error)) {
            continue;
          }
          throw error;
        }
      }

      nextPosts.sort(comparePosts);
      posts.value = nextPosts;
      status.value = nextPosts.length === 0 ? "empty" : "ready";
    } catch (error) {
      if (disposed || run !== refreshRun) {
        return;
      }

      if (isNotFoundError(error)) {
        status.value = "empty";
        return;
      }

      debugWarn("[blog] failed to load blog index", error);
      status.value = "error";
    }
  }

  function dispose(): void {
    disposed = true;
    refreshRun += 1;
  }

  onMounted(() => {
    void refresh();
  });

  onUnmounted(() => {
    dispose();
  });

  return {
    dispose,
    empty,
    loadFailed,
    loading,
    posts,
    refresh,
    status,
  };
}
