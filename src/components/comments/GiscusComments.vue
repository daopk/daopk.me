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

function appendScript(config: GiscusConfig, target: CommentTarget): void {
  const root = mountEl.value;
  if (root === null) {
    return;
  }

  const script = document.createElement("script");
  script.src = config.clientUrl;
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("async", "");
  script.setAttribute("crossorigin", "anonymous");
  script.setAttribute("data-repo", config.repo);
  script.setAttribute("data-repo-id", config.repoId);
  script.setAttribute("data-category", config.category);
  script.setAttribute("data-category-id", config.categoryId);
  script.setAttribute("data-mapping", "specific");
  script.setAttribute("data-term", target.id);
  script.setAttribute("data-strict", config.strict);
  script.setAttribute("data-reactions-enabled", config.reactionsEnabled);
  script.setAttribute("data-emit-metadata", config.emitMetadata);
  script.setAttribute("data-input-position", config.inputPosition);
  script.setAttribute("data-theme", theme.value);
  script.setAttribute("data-lang", config.lang);
  script.setAttribute("data-loading", config.loading);

  root.appendChild(script);
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
  appendScript(resolvedConfig.value, target);
}

function updateFrameTheme(): void {
  mountEl.value?.querySelector("script")?.setAttribute("data-theme", theme.value);
  const frame = mountEl.value?.querySelector<HTMLIFrameElement>("iframe.giscus-frame");
  frame?.contentWindow?.postMessage(
    { giscus: { setConfig: { theme: theme.value } } },
    GISCUS_ORIGIN,
  );
}

function syncTheme(): void {
  theme.value = documentTheme();
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

  renderGiscus();
});

onUnmounted(() => {
  mounted = false;
  themeObserver?.disconnect();
  themeObserver = undefined;
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
    resolvedConfig.value.lang,
    resolvedConfig.value.repo,
    resolvedConfig.value.repoId,
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

.comments__disabled {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-fg-muted);
  font-size: var(--font-size-sm);
  margin: 0;
  padding: var(--space-sm) var(--space-md);
}
</style>
