<script setup lang="ts">
import { ArrowLeft, Layers2, Minimize2 } from "~/icons/lucide";
import { computed, nextTick, onMounted, provide, ref, shallowRef, watch } from "vue";

import { useKernel } from "~/composables/useKernel";
import { useEdgeSwipe } from "~/composables/useEdgeSwipe";

import AppMount from "~/shells/desktop/windowManager/AppMount.vue";

import {
  AppChromeInjectionKey,
  type AppChromeBackAction,
  type AppChromeTitlebarVisibility,
} from "~/types/app";
import type { NavigationFrame } from "./navigation";

const props = withDefaults(
  defineProps<{
    frame: NavigationFrame;
    title: string;
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
    isForegroundFrame: undefined,
  },
);

const emit = defineEmits<{
  (e: "back"): void;
  (e: "close"): void;
  (e: "hide"): void;
  (e: "recents"): void;
}>();

const kernel = useKernel();
const surface = ref<HTMLElement | null>(null);
const backButtonRef = ref<HTMLButtonElement | null>(null);
const chromeTitle = ref<string | null>(null);
const chromeBackAction = shallowRef<AppChromeBackAction | null>(null);
const chromeTitlebar = ref<AppChromeTitlebarVisibility | null>(null);

const manifest = computed(() =>
  kernel.apps.list().find((entry) => entry.id === props.frame.manifestId),
);
const animateForeground = computed<boolean>(() =>
  props.isForegroundFrame === undefined ? props.isCurrent : props.isForegroundFrame,
);
const displayTitle = computed(() => chromeTitle.value ?? props.title);
const backAriaLabel = computed(() => chromeBackAction.value?.ariaLabel ?? "Back to home");
const manifestTitlebar = computed<AppChromeTitlebarVisibility>(
  () => manifest.value?.chrome?.mobile?.titlebar ?? "visible",
);
const resolvedTitlebar = computed<AppChromeTitlebarVisibility>(
  () => chromeTitlebar.value ?? manifestTitlebar.value,
);
const showTitlebar = computed(() => resolvedTitlebar.value !== "hidden");
const edgeSwipeEnabled = computed(
  () => manifest.value?.chrome?.mobile?.edgeSwipe !== "disabled",
);
const edgeSwipeSurface = ref<HTMLElement | null>(null);

provide(AppChromeInjectionKey, {
  setTitle(title) {
    chromeTitle.value = title;
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

const appContentSafeAreaStyle = computed<Record<string, string>>(() => ({
  "--mobile-shell-app-safe-area-top": showTitlebar.value
    ? "0px"
    : "var(--app-view-safe-area-top)",
  "--mobile-shell-app-safe-area-right": "var(--app-view-safe-area-right)",
  "--mobile-shell-app-safe-area-bottom": "var(--app-view-safe-area-bottom)",
  "--mobile-shell-app-safe-area-left": "var(--app-view-safe-area-left)",
  "--mobile-shell-app-bottom-padding": "max(32px, var(--app-view-safe-area-bottom))",
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
    backButtonRef.value?.focus({ preventScroll: true });
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
      <button
        ref="backButtonRef"
        type="button"
        class="app-view__back"
        :aria-label="backAriaLabel"
        :tabindex="isCurrent ? 0 : -1"
        @click="onBackClick"
      >
        <ArrowLeft :size="20" :stroke-width="2.25" aria-hidden="true" />
      </button>
      <h1 class="app-view__title">{{ displayTitle }}</h1>
      <button
        type="button"
        class="app-view__recents"
        aria-label="Open recent apps"
        :tabindex="isCurrent ? 0 : -1"
        @click="onRecentsClick"
      >
        <Layers2 :size="20" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="app-view__hide"
        aria-label="Hide app to home screen"
        :tabindex="isCurrent ? 0 : -1"
        @click="onHideClick"
      >
        <Minimize2 :size="20" :stroke-width="2" aria-hidden="true" />
      </button>
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
  --app-view-safe-area-top: max(0px, env(safe-area-inset-top, 0px));
  --app-view-safe-area-right: max(0px, env(safe-area-inset-right, 0px));
  --app-view-safe-area-bottom: max(0px, env(safe-area-inset-bottom, 0px));
  --app-view-safe-area-left: max(0px, env(safe-area-inset-left, 0px));

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
  block-size: calc(48px + var(--app-view-safe-area-top));
  border-block-end: 1px solid var(--color-border);
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
  padding-block-start: var(--app-view-safe-area-top);
  padding-inline-end: calc(var(--space-md) + var(--app-view-safe-area-right));
  padding-inline-start: calc(var(--space-md) + var(--app-view-safe-area-left));
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
