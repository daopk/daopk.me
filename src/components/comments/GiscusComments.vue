<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import {
  isGiscusConfigReady,
  resolveGiscusConfig,
  type CommentTarget,
  type GiscusConfig,
} from "~/core/comments";

type GiscusTheme = "dark" | "light";

const GISCUS_ORIGIN = "https://giscus.app";
const GISCUS_BACKLINK_META_NAME = "giscus:backlink";
const GISCUS_SESSION_STORAGE_KEY = "giscus-session";

const props = defineProps<{
  readonly config?: Partial<GiscusConfig>;
  readonly target: CommentTarget | null;
}>();

const mountEl = ref<HTMLElement | null>(null);
const theme = ref<GiscusTheme>("light");

let mounted = false;
let themeObserver: MutationObserver | undefined;
let backlinkMeta: HTMLMetaElement | null = null;
let ownsBacklinkMeta = false;
let previousBacklinkContent: string | null | undefined;

const resolvedConfig = computed(() => resolveGiscusConfig(props.config));
const disabled = computed(
  () => props.target === null || !isGiscusConfigReady(resolvedConfig.value),
);
const label = computed(() =>
  props.target === null ? "Comments" : `Comments for ${props.target.title}`,
);

function documentTheme(): GiscusTheme {
  if (typeof document !== "undefined") {
    const resolved = document.documentElement.dataset.theme;
    if (resolved === "dark" || resolved === "light") {
      return resolved;
    }
  }

  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function setBacklinkMeta(url: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const existing = document.querySelector<HTMLMetaElement>(
    `meta[name="${GISCUS_BACKLINK_META_NAME}"]`,
  );

  if (backlinkMeta !== null && existing === backlinkMeta) {
    backlinkMeta.setAttribute("content", url);
    return;
  }

  backlinkMeta = existing ?? document.createElement("meta");
  ownsBacklinkMeta = existing === null;
  if (previousBacklinkContent === undefined && existing !== null) {
    previousBacklinkContent = existing.getAttribute("content");
  }

  backlinkMeta.setAttribute("name", GISCUS_BACKLINK_META_NAME);
  backlinkMeta.setAttribute("content", url);
  if (existing === null) {
    document.head.appendChild(backlinkMeta);
  }
}

function restoreBacklinkMeta(): void {
  if (backlinkMeta === null) {
    return;
  }

  if (ownsBacklinkMeta) {
    backlinkMeta.remove();
  } else if (previousBacklinkContent === undefined || previousBacklinkContent === null) {
    backlinkMeta.removeAttribute("content");
  } else {
    backlinkMeta.setAttribute("content", previousBacklinkContent);
  }

  backlinkMeta = null;
  ownsBacklinkMeta = false;
  previousBacklinkContent = undefined;
}

function clearMount(): void {
  mountEl.value?.replaceChildren();
}

function clientOrigin(config: GiscusConfig): string {
  try {
    return new URL(config.clientUrl).origin;
  } catch {
    return GISCUS_ORIGIN;
  }
}

function currentGiscusOriginUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("giscus");
  url.hash = "";
  return url.toString();
}

function metaContent(name: string, includeOpenGraph = false): string {
  if (typeof document === "undefined") {
    return "";
  }

  const openGraphSelector = includeOpenGraph ? `meta[property="og:${name}"],` : "";
  const meta = document.querySelector<HTMLMetaElement>(`${openGraphSelector}meta[name="${name}"]`);
  return meta?.content ?? "";
}

function storedGiscusSession(): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const value = window.localStorage.getItem(GISCUS_SESSION_STORAGE_KEY);
    return value === null ? "" : String(JSON.parse(value));
  } catch {
    removeStoredGiscusSession();
    return "";
  }
}

function removeStoredGiscusSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(GISCUS_SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened browser modes.
  }
}

function consumeGiscusSessionFromUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  const session = url.searchParams.get("giscus") ?? "";
  if (session.length === 0) {
    return storedGiscusSession();
  }

  try {
    window.localStorage.setItem(GISCUS_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The current render can still use the session query value.
  }

  url.searchParams.delete("giscus");
  url.hash = "";
  window.history.replaceState(window.history.state, document.title, url.toString());
  return session;
}

function widgetUrl(config: GiscusConfig, target: CommentTarget, session: string): string {
  const langPath = config.lang.trim().length > 0 ? `/${encodeURIComponent(config.lang)}` : "";
  const params = new URLSearchParams({
    backLink: target.canonicalUrl,
    category: config.category,
    categoryId: config.categoryId,
    description: metaContent("description", true),
    emitMetadata: config.emitMetadata,
    inputPosition: config.inputPosition,
    origin: currentGiscusOriginUrl(),
    reactionsEnabled: config.reactionsEnabled,
    repo: config.repo,
    repoId: config.repoId,
    session,
    strict: config.strict,
    term: target.id,
    theme: theme.value,
  });

  return `${clientOrigin(config)}${langPath}/widget?${params.toString()}`;
}

function setFrameCredentialless(frame: HTMLIFrameElement): void {
  frame.setAttribute("credentialless", "credentialless");
  (frame as HTMLIFrameElement & { credentialless?: boolean }).credentialless = true;
}

function appendFrame(config: GiscusConfig, target: CommentTarget): void {
  const root = mountEl.value;
  if (root === null) {
    return;
  }

  const container = document.createElement("div");
  container.className = "giscus";

  const frame = document.createElement("iframe");
  frame.className = "giscus-frame giscus-frame--loading";
  frame.title = "Comments";
  frame.scrolling = "no";
  frame.setAttribute("scrolling", "no");
  frame.allow = "clipboard-write";
  frame.loading = config.loading;
  frame.setAttribute("loading", config.loading);
  frame.style.opacity = "0";
  setFrameCredentialless(frame);
  frame.src = widgetUrl(config, target, consumeGiscusSessionFromUrl());
  frame.addEventListener("load", () => {
    frame.style.removeProperty("opacity");
    frame.classList.remove("giscus-frame--loading");
  });

  container.appendChild(frame);
  root.appendChild(container);
}

function renderGiscus(): void {
  if (!mounted) {
    return;
  }

  clearMount();
  const target = props.target;
  if (target === null || disabled.value) {
    restoreBacklinkMeta();
    return;
  }

  setBacklinkMeta(target.canonicalUrl);
  appendFrame(resolvedConfig.value, target);
}

function updateFrameTheme(): void {
  const frame = mountEl.value?.querySelector<HTMLIFrameElement>("iframe.giscus-frame");
  frame?.contentWindow?.postMessage(
    { giscus: { setConfig: { theme: theme.value } } },
    clientOrigin(resolvedConfig.value),
  );
}

function syncTheme(): void {
  theme.value = documentTheme();
}

function handleGiscusMessage(event: MessageEvent): void {
  if (event.origin !== clientOrigin(resolvedConfig.value)) {
    return;
  }

  const data = event.data as { giscus?: unknown };
  if (
    typeof data !== "object" ||
    data === null ||
    typeof data.giscus !== "object" ||
    data.giscus === null
  ) {
    return;
  }

  const message = data.giscus as {
    readonly error?: unknown;
    readonly resizeHeight?: unknown;
    readonly signOut?: unknown;
  };

  if (typeof message.resizeHeight === "number") {
    const frame = mountEl.value?.querySelector<HTMLIFrameElement>("iframe.giscus-frame");
    if (frame !== undefined && frame !== null) {
      frame.style.height = `${message.resizeHeight}px`;
    }
  }

  if (message.signOut === true) {
    removeStoredGiscusSession();
    renderGiscus();
  }

  if (typeof message.error === "string") {
    handleGiscusError(message.error);
  }
}

function handleGiscusError(error: string): void {
  if (
    error.includes("Bad credentials") ||
    error.includes("Invalid state value") ||
    error.includes("State has expired")
  ) {
    removeStoredGiscusSession();
    console.warn(`[giscus] ${error}. Session has been cleared.`);
    renderGiscus();
    return;
  }

  if (error.includes("Discussion not found") || error.includes("API rate limit exceeded")) {
    console.warn(`[giscus] ${error}`);
    return;
  }

  console.error(`[giscus] ${error}`);
}

onMounted(() => {
  mounted = true;
  syncTheme();

  if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
    themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["data-theme"],
      attributes: true,
    });
  }

  window.addEventListener("message", handleGiscusMessage);
  renderGiscus();
});

onUnmounted(() => {
  mounted = false;
  themeObserver?.disconnect();
  themeObserver = undefined;
  window.removeEventListener("message", handleGiscusMessage);
  clearMount();
  restoreBacklinkMeta();
});

watch(
  () => [
    props.target?.canonicalUrl,
    props.target?.id,
    props.target?.title,
    resolvedConfig.value.category,
    resolvedConfig.value.categoryId,
    resolvedConfig.value.clientUrl,
    resolvedConfig.value.emitMetadata,
    resolvedConfig.value.inputPosition,
    resolvedConfig.value.lang,
    resolvedConfig.value.loading,
    resolvedConfig.value.reactionsEnabled,
    resolvedConfig.value.repo,
    resolvedConfig.value.repoId,
    resolvedConfig.value.strict,
  ],
  () => {
    void nextTick(renderGiscus);
  },
);

watch(theme, () => {
  updateFrameTheme();
});
</script>

<template>
  <section class="comments" :aria-label="label">
    <p v-if="disabled" class="comments__disabled" role="status">Comments unavailable.</p>
    <div v-else ref="mountEl" class="comments__mount" />
  </section>
</template>

<style scoped lang="scss">
.comments {
  color: var(--color-fg);
  inline-size: 100%;
}

.comments__mount {
  min-block-size: 120px;
}

.comments__mount :deep(.giscus),
.comments__mount :deep(.giscus-frame) {
  inline-size: 100%;
  min-block-size: 150px;
}

.comments__mount :deep(.giscus-frame) {
  border: 0;
  color-scheme: light dark;
}

.comments__mount :deep(.giscus-frame--loading) {
  opacity: 0;
}

.comments__disabled {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  margin: 0;
  padding: var(--space-sm) var(--space-md);
}
</style>
