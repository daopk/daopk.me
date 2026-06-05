import { computed, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from "vue";

import { debugWarn } from "@daopk/sdk";
import {
  BLOG_POSTS_ROOT,
  blogPostPathFromSlug,
  formatBlogDate,
  validBlogDate,
  type BlogContentSource,
  type BlogIndexEntry,
} from "@daopk/content";

export type BlogIndexStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface BlogIndexPost {
  readonly date: string | null;
  readonly excerpt: string;
  readonly formattedDate: string | null;
  readonly path: string;
  readonly slug: string;
  readonly thumbnail: BlogIndexEntry["thumbnail"];
  readonly title: string;
}

export interface BlogIndexOptions {
  readonly source: Pick<BlogContentSource, "readIndexCache" | "fetchIndex">;
}

export interface BlogIndexBindings {
  readonly dispose: () => void;
  readonly empty: ComputedRef<boolean>;
  readonly loadFailed: ComputedRef<boolean>;
  readonly loading: ComputedRef<boolean>;
  readonly posts: Ref<readonly BlogIndexPost[]>;
  readonly refresh: () => Promise<void>;
  readonly status: Ref<BlogIndexStatus>;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part.length === 0 ? part : `${part[0]!.toUpperCase()}${part.slice(1)}`))
    .join(" ");
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

export function blogIndexPostFromEntry(entry: BlogIndexEntry): BlogIndexPost {
  const date = validBlogDate(entry.date);

  return {
    date,
    excerpt: entry.description ?? "",
    formattedDate: date === null ? null : formatBlogDate(date),
    path: blogPostPathFromSlug(entry.slug) ?? `${BLOG_POSTS_ROOT}/${entry.slug}.md`,
    slug: entry.slug,
    thumbnail: entry.thumbnail ?? null,
    title: entry.title ?? titleFromSlug(entry.slug),
  };
}

function postsFromEntries(entries: readonly BlogIndexEntry[]): readonly BlogIndexPost[] {
  return entries.map(blogIndexPostFromEntry).sort(comparePosts);
}

export function useBlogIndex({ source }: BlogIndexOptions): BlogIndexBindings {
  const posts = ref<readonly BlogIndexPost[]>([]);
  const status = ref<BlogIndexStatus>("idle");

  const empty = computed(() => status.value === "empty");
  const loadFailed = computed(() => status.value === "error");
  const loading = computed(() => status.value === "loading");

  let disposed = false;
  let refreshRun = 0;

  function applyEntries(entries: readonly BlogIndexEntry[]): void {
    const next = postsFromEntries(entries);
    posts.value = next;
    status.value = next.length === 0 ? "empty" : "ready";
  }

  async function refresh(): Promise<void> {
    const run = ++refreshRun;
    status.value = "loading";

    // Read-through cache first so a returning visitor sees posts instantly and
    // offline, then revalidate from the network.
    let hasCache = false;
    try {
      const cached = await source.readIndexCache();
      if (disposed || run !== refreshRun) {
        return;
      }
      if (cached !== null) {
        hasCache = true;
        applyEntries(cached);
      }
    } catch (error) {
      debugWarn("[blog] failed to read cached blog index", error);
    }

    try {
      const fresh = await source.fetchIndex();
      if (disposed || run !== refreshRun) {
        return;
      }
      applyEntries(fresh);
    } catch (error) {
      if (disposed || run !== refreshRun) {
        return;
      }
      if (hasCache) {
        debugWarn("[blog] serving cached blog index; refresh failed", error);
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
