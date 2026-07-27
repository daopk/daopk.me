<script setup vapor lang="ts">
import ArrowLeft from "~icons/lucide/arrow-left";
import Layers2 from "~icons/lucide/layers-2";
import Minimize2 from "~icons/lucide/minimize-2";
import { computed, nextTick, onMounted, provide, ref, shallowRef, watch } from "vue";

import { useEdgeSwipe } from "~/composables/useEdgeSwipe";
import { IconButton } from "~/components/ui";

import AppMount from "~/shells/shared/AppMount.vue";

import {
  AppChromeInjectionKey,
  type AppChromeBackAction,
  type AppChromeTitlebarVisibility,
} from "~/types/app";
import type { NavigationFrame } from "./useMobileSession";
import type { MobileManifest } from "./useMobileManifestProjection";

const props = withDefaults(
  defineProps<{
    frame: NavigationFrame;
    manifest?: MobileManifest | null;
    title?: string;
    /**
     * Whether this AppView is the user-interacting surface. Drives
     * `aria-current`, `inert`, `tabindex` on chrome buttons, and the
     * `:focused` prop forwarded to `AppMount`. Flips false when the
     * `AppSwitcher` opens so the underlying app pauses keyboard /
     * lifecycle interaction.
     */
    isCurrent: boolean;
    isForegroundFrame?: boolean;
  }>(),
  {
    manifest: null,
    title: undefined,
    isForegroundFrame: undefined,
  },
);

const emit = defineEmits<{
  (e: "back"): void;
  (e: "close"): void;
  (e: "hide"): void;
  (e: "recents"): void;
  (e: "title:frame", handleId: string, manifestId: string, title: string | null): void;
}>();

const surface = ref<HTMLElement | null>(null);
const chromeTitle = ref<string | null>(null);
const chromeBackAction = shallowRef<AppChromeBackAction | null>(null);
const chromeTitlebar = ref<AppChromeTitlebarVisibility | null>(null);

const animateForeground = computed<boolean>(() =>
  props.isForegroundFrame === undefined ? props.isCurrent : props.isForegroundFrame,
);
const displayTitle = computed(
  () => chromeTitle.value ?? props.manifest?.name ?? props.title ?? props.frame.manifestId,
);
const backAriaLabel = computed(() => chromeBackAction.value?.ariaLabel ?? "Back to home");
const manifestTitlebar = computed<AppChromeTitlebarVisibility>(
  () => props.manifest?.chrome.titlebar ?? "visible",
);
const resolvedTitlebar = computed<AppChromeTitlebarVisibility>(
  () => chromeTitlebar.value ?? manifestTitlebar.value,
);
const showTitlebar = computed(() => resolvedTitlebar.value !== "hidden");
const edgeSwipeEnabled = computed(() => props.manifest?.chrome.edgeSwipe !== "disabled");
const edgeSwipeSurface = ref<HTMLElement | null>(null);

provide(AppChromeInjectionKey, {
  rendersAppChrome: true,
  setTitle(title) {
    const nextTitle = normalizeFrameTitle(title);
    chromeTitle.value = nextTitle;
    emit("title:frame", props.frame.handleId, props.frame.manifestId, nextTitle);
  },
  setBackAction(action) {
    chromeBackAction.value = action;
  },
  setTitlebar(visibility) {
    chromeTitlebar.value = visibility;
  },
  hide() {
    emit("hide");
  },
  close() {
    emit("close");
  },
});

function normalizeFrameTitle(title: string | null): string | null {
  const trimmed = title?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

const appContentSafeAreaStyle = computed<Record<string, string>>(() => ({
  "--mobile-shell-app-safe-area-top": showTitlebar.value
    ? "0px"
    : "var(--mobile-shell-safe-area-top, 0px)",
  "--mobile-shell-app-safe-area-right": "var(--mobile-shell-safe-area-right, 0px)",
  "--mobile-shell-app-safe-area-bottom": "var(--mobile-shell-safe-area-bottom, 0px)",
  "--mobile-shell-app-safe-area-left": "var(--mobile-shell-safe-area-left, 0px)",
  "--mobile-shell-app-bottom-padding": "max(32px, var(--mobile-shell-safe-area-bottom, 0px))",
}));

useEdgeSwipe(edgeSwipeSurface, {
  edge: "left",
  edgeThreshold: 24,
  distanceThreshold: 80,
  velocityThreshold: 0.3,
  onSwipe(): void {
    if (props.isCurrent) {
      dispatchBack();
    }
  },
  acceptMouse: false,
});

watch(
  [surface, edgeSwipeEnabled],
  ([nextSurface, nextEnabled]) => {
    edgeSwipeSurface.value = nextEnabled ? nextSurface : null;
  },
  { immediate: true, flush: "post" },
);

function dispatchBack(): void {
  const action = chromeBackAction.value;
  if (action) {
    action.handler();
    return;
  }
  emit("back");
}

function onBackClick(): void {
  dispatchBack();
}

function onRecentsClick(): void {
  emit("recents");
}

function onHideClick(): void {
  emit("hide");
}

function focusBackButton(): void {
  if (!showTitlebar.value) {
    return;
  }
  void nextTick(() => {
    surface.value?.querySelector<HTMLButtonElement>(".app-view__back")?.focus({
      preventScroll: true,
    });
  });
}

onMounted(() => {
  if (props.isCurrent) {
    focusBackButton();
  }
});

watch(
  () => [props.isCurrent, showTitlebar.value] as const,
  ([nextCurrent, nextTitlebar], [prevCurrent, prevTitlebar]) => {
    if (nextCurrent && nextTitlebar && (!prevCurrent || !prevTitlebar)) {
      focusBackButton();
    }
  },
);
</script>

<template>
  <section
    ref="surface"
    class="app-view"
    role="main"
    :class="{
      'app-view--foreground': animateForeground,
      'app-view--titlebar-hidden': !showTitlebar,
    }"
    :data-handle-id="frame.handleId"
    :data-manifest-id="frame.manifestId"
    :aria-current="isCurrent ? 'page' : undefined"
    :aria-hidden="isCurrent ? undefined : 'true'"
    :inert="isCurrent ? undefined : true"
  >
    <header v-if="showTitlebar" class="app-view__chrome">
      <IconButton
        class="app-view__back"
        :ariaLabel="backAriaLabel"
        variant="plain"
        :tabindex="isCurrent ? 0 : -1"
        @click="onBackClick"
      >
        <ArrowLeft aria-hidden="true" />
      </IconButton>
      <h1 class="app-view__title">{{ displayTitle }}</h1>
      <IconButton
        class="app-view__recents"
        ariaLabel="Open recent apps"
        variant="plain"
        :tabindex="isCurrent ? 0 : -1"
        @click="onRecentsClick"
      >
        <Layers2 aria-hidden="true" />
      </IconButton>
      <IconButton
        class="app-view__hide"
        ariaLabel="Hide app to home screen"
        variant="plain"
        :tabindex="isCurrent ? 0 : -1"
        @click="onHideClick"
      >
        <Minimize2 aria-hidden="true" />
      </IconButton>
    </header>
    <div class="app-view__body" :style="appContentSafeAreaStyle">
      <AppMount
        :manifest-id="frame.manifestId"
        :handle-id="frame.handleId"
        :focused="isCurrent"
        :args="frame.args"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.app-view {
  background: var(--color-bg);
  block-size: 100%;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  inset: 0;
  position: absolute;

  // The chrome (this `<section>`) is the animated surface. `transform`
  // keeps the mobile shell entry/exit path on the compositor.
  transform: translateX(100%);
  pointer-events: none;
  transition: transform 280ms var(--ease);
  will-change: transform;
  z-index: 0;

  &.app-view--foreground {
    animation: app-view-slide-in 280ms var(--ease) both;
    transform: translateX(0);
    pointer-events: auto;
    z-index: 1;
  }
}

@keyframes app-view-slide-in {
  from {
    transform: translateX(100%);
  }

  to {
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-view {
    transition: none;
  }

  .app-view.app-view--foreground {
    animation: none;
  }
}

.app-view__chrome {
  align-items: center;
  background: var(--color-bg-elevated);
  block-size: calc(48px + var(--mobile-shell-safe-area-top, 0px));
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
  padding-block-start: var(--mobile-shell-safe-area-top, 0px);
  padding-inline-end: calc(var(--space-md) + var(--mobile-shell-safe-area-right, 0px));
  padding-inline-start: calc(var(--space-md) + var(--mobile-shell-safe-area-left, 0px));
}

.app-view__back,
.app-view__recents,
.app-view__hide {
  align-items: center;
  background: transparent;
  border: 0;
  block-size: 36px;
  border-radius: var(--radius-md);
  color: var(--color-fg);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 36px;
  inline-size: 36px;
  justify-content: center;
  transition: background var(--duration-fast) var(--ease);

  svg {
    block-size: 20px;
    inline-size: 20px;
  }

  &:hover {
    background: var(--color-bg-subtle);
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}

.app-view__title {
  color: var(--color-fg);
  flex: 1 1 auto;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0;
  margin: 0;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-view__body {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow: hidden;
  position: relative;
}
</style>
