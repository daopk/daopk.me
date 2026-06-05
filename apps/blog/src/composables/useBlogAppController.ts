import { computed, onUnmounted, ref, type Component, type ComputedRef, type Ref } from "vue";

import { useAppChrome } from "@daopk/kit";
import { Check, Share2 } from "@daopk/icons";
import type { AppChromeBackAction, AppContext, Kernel } from "@daopk/sdk";

import type { BlogIndexBindings, BlogIndexPost } from "./useBlogIndex";
import type { BlogPostBindings } from "./useBlogPost";
import { replaceBlogIndexPath, replaceBlogPostPath } from "../utils/blogBrowserPath";
import {
  anchorFromClick,
  blogContentLinkActionFromHref,
  isPlainPrimaryClick,
  type BlogLaunchIntent,
} from "../utils/blogContentLinks";
import { documentPathFromPostArgs, stringArg, type BlogPostArgs } from "../utils/blogPostArgs";

export type BlogView = "index" | "post";
export type BlogPostCover = NonNullable<BlogIndexPost["thumbnail"]>;

export interface UseBlogAppControllerOptions {
  readonly appContext: AppContext | null;
  readonly blogIndex: BlogIndexBindings;
  readonly blogPost: BlogPostBindings;
  readonly kernel: Pick<Kernel, "events">;
}

export interface UseBlogAppControllerBindings {
  readonly busy: ComputedRef<boolean>;
  readonly chromeAvailable: boolean;
  readonly currentPostCover: ComputedRef<BlogPostCover | null>;
  readonly debugHandleId: string | undefined;
  readonly notFoundDescription: ComputedRef<string>;
  readonly shareButtonIcon: ComputedRef<Component>;
  readonly shareButtonLabel: ComputedRef<string>;
  readonly shareCopied: Ref<boolean>;
  readonly view: Ref<BlogView>;
  onPostContentClick(event: MouseEvent): void;
  onPostSelect(post: BlogIndexPost): void;
  onShareClick(): void;
  openIndex(): void;
  openPost(args: BlogPostArgs & { readonly slug: string }): void;
}

export function useBlogAppController({
  appContext,
  blogIndex,
  blogPost,
  kernel,
}: UseBlogAppControllerOptions): UseBlogAppControllerBindings {
  const initialSlug = stringArg(appContext?.args.slug);
  const view = ref<BlogView>(initialSlug === null ? "index" : "post");
  const currentPostPath = ref<string | null>(
    initialSlug === null ? null : documentPathFromPostArgs(appContext?.args),
  );
  const shareCopied = ref(false);
  const missingLabel = computed(() => blogPost.slug.value ?? "post");
  const notFoundDescription = computed(() => `The post "${missingLabel.value}" is not available.`);
  const busy = computed(
    () =>
      (view.value === "index" && blogIndex.status.value === "loading") ||
      (view.value === "post" && blogPost.status.value === "loading"),
  );
  const currentPostCover = computed(() => {
    if (view.value !== "post" || blogPost.status.value !== "ready") {
      return null;
    }

    const slug = blogPost.slug.value;
    if (slug === null) {
      return null;
    }

    return blogIndex.posts.value.find((post) => post.slug === slug)?.thumbnail ?? null;
  });
  const chromeTitle = computed(() =>
    view.value === "post" ? (blogPost.metadata.value.title ?? "Blog") : null,
  );
  const chromeBackAction = computed<AppChromeBackAction | null>(() =>
    view.value === "post" ? { ariaLabel: "Back to Blog", handler: openIndex } : null,
  );
  const chrome = useAppChrome({ title: chromeTitle, backAction: chromeBackAction });
  const shareButtonLabel = computed(() => (shareCopied.value ? "Copied URL" : "Share post"));
  const shareButtonIcon = computed<Component>(() => (shareCopied.value ? Check : Share2));
  const debugHandleId = import.meta.env.DEV ? appContext?.handleId : undefined;

  let shareCopiedTimeout: number | undefined;

  const stopOpenRequests = kernel.events.on("blog.open.requested", (payload) => {
    const slug = stringArg(payload.slug);
    if (slug === null) {
      openIndex();
      return;
    }

    openPost({
      slug,
      ...(typeof payload.path === "string" ? { path: payload.path } : {}),
    });
  });

  emitDocumentPath(currentPostPath.value);

  onUnmounted(() => {
    stopOpenRequests();
    clearShareCopiedTimeout();
  });

  function openIndex(): void {
    view.value = "index";
    currentPostPath.value = null;
    emitDocumentPath(null);
    replaceBlogIndexPath();
  }

  function openPost(args: BlogPostArgs & { readonly slug: string }): void {
    view.value = "post";
    currentPostPath.value = documentPathFromPostArgs(args);
    emitDocumentPath(currentPostPath.value);
    blogPost.open(args);
    replaceBlogPostPath(args.slug);
  }

  function emitDocumentPath(path: string | null): void {
    if (appContext === null) {
      return;
    }

    kernel.events.emit("app.document.changed", {
      manifestId: appContext.manifestId,
      handleId: appContext.handleId,
      path,
    });
  }

  function onPostSelect(post: BlogIndexPost): void {
    openPost({ slug: post.slug, path: post.path });
  }

  function clearShareCopiedTimeout(): void {
    if (shareCopiedTimeout === undefined || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(shareCopiedTimeout);
    shareCopiedTimeout = undefined;
  }

  function markShareCopied(): void {
    shareCopied.value = true;
    clearShareCopiedTimeout();
    shareCopiedTimeout = window.setTimeout(() => {
      shareCopied.value = false;
      shareCopiedTimeout = undefined;
    }, 1600);
  }

  async function copyCurrentUrl(): Promise<void> {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    const writeText = navigator.clipboard?.writeText;
    if (writeText === undefined) {
      return;
    }

    try {
      await writeText.call(navigator.clipboard, window.location.href);
      markShareCopied();
    } catch {
      shareCopied.value = false;
    }
  }

  function onShareClick(): void {
    void copyCurrentUrl();
  }

  function launchIntent(intent: BlogLaunchIntent): void {
    kernel.events.emit("app.launch.requested", {
      manifestId: intent.manifestId,
      source: "deeplink",
      ...(intent.args === undefined ? {} : { args: intent.args }),
    });
  }

  function onPostContentClick(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }

    const anchor = anchorFromClick(event);
    const href = anchor?.getAttribute("href");
    if (href === undefined || href === null) {
      return;
    }

    const action = blogContentLinkActionFromHref(href, isPlainPrimaryClick(event));
    if (action.kind === "ignore") {
      return;
    }

    event.preventDefault();
    if (action.kind === "launch") {
      launchIntent(action.intent);
    }
  }

  return {
    busy,
    chromeAvailable: chrome.available,
    currentPostCover,
    debugHandleId,
    notFoundDescription,
    shareButtonIcon,
    shareButtonLabel,
    shareCopied,
    view,
    onPostContentClick,
    onPostSelect,
    onShareClick,
    openIndex,
    openPost,
  };
}
