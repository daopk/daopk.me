<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import Wallpaper from "~/components/wallpaper/Wallpaper.vue";
import { useToast } from "~/components/ui";
import HomeScreen from "./homeScreen/HomeScreen.vue";
import AppView from "./AppView.vue";
import AppSwitcher from "./appSwitcher/AppSwitcher.vue";
import MobilePermissionPromptHost from "./permissionPrompt/MobilePermissionPromptHost.vue";
import MobileSpotlightHost from "./spotlight/MobileSpotlightHost.vue";
import { useKernel } from "~/composables/useKernel";
import { useWallpaperLabelContrast } from "~/composables/useWallpaperLabelContrast";
import { hasAppSettings } from "~/core/apps/appSettings";
import { appSupportsShell, appUnsupportedShellMessage } from "~/core/apps/shellSupport";
import { debugWarn } from "~/core/debug";
import {
  appBrowserTitle,
  appFallbackBrowserPath,
  DEFAULT_BROWSER_TITLE,
  HOME_BROWSER_PATH,
} from "~/core/routing/appBrowserPaths";
import { isBlogPostSlug } from "~/core/routing/blogPaths";
import { emitAppResume, resolveAppResume, type AppResumeSource } from "~/core/routing/appResume";
import { documentPathFor } from "~/shells/shared/documentOpenRouting";
import {
  normalizeShellOpenRequestPath,
  preferredManifestFrame,
} from "~/shells/shared/shellOpenRequests";
import { useShellAppEventBridge } from "~/shells/shared/useShellAppEventBridge";
import { useShellBrowserChromeSync } from "~/shells/shared/useShellBrowserChromeSync";
import { useMobileNavigation } from "./useMobileNavigation";
import { useAppViewTitle } from "./useAppViewTitle";
import { useMobileLaunchState } from "./useMobileLaunchState";
import type { AppManifest } from "~/types/app";

const kernel = useKernel();
const nav = useMobileNavigation();
const toast = useToast();
const { titleFor } = useAppViewTitle();
const homeLabelContrastStyle = useWallpaperLabelContrast("mobile");

useShellAppEventBridge({
  launch: (manifestId, args, source) => {
    onLaunch(manifestId, args, source);
  },
  spawnNew: (manifestId, args) => {
    onSpawnNew(manifestId, args);
  },
  openEditor: (path) => {
    void onEditorOpenRequested(path);
  },
  openBlogPost: (path, slug) => {
    void onBlogPostOpenRequested(path, slug);
  },
  openPdfViewer: (path) => {
    void onPdfViewerOpenRequested(path);
  },
  setDocumentPath: (handleId, manifestId, path) => {
    nav.setDocumentPath(handleId, manifestId, path);
  },
  setBrowserPath: (handleId, manifestId, path) => {
    nav.setBrowserPath(handleId, manifestId, path);
  },
  removeByHandleId: (handleId) => {
    nav.removeByHandleId(handleId);
  },
});

const showSwitcher = ref(false);

const switcherActive = computed(() => showSwitcher.value && nav.depth.value > 0);

const isHome = computed(() => nav.foreground.value === null);

const activeBrowserPath = computed(() => {
  const frame = nav.currentFrame.value;
  if (frame === null) {
    return HOME_BROWSER_PATH;
  }

  return frame.browserPath ?? appFallbackBrowserPath(frame.manifestId);
});

const activeBrowserTitle = computed(() => {
  const frame = nav.currentFrame.value;
  if (frame === null) {
    return DEFAULT_BROWSER_TITLE;
  }

  return appBrowserTitle(frame.title ?? titleFor(frame.manifestId));
});

type HomeScreenInstance = InstanceType<typeof HomeScreen> & {
  scrollEl: HTMLElement | null;
};
const homeRef = ref<HomeScreenInstance | null>(null);
const homeScrollEl = computed<HTMLElement | null>(() => homeRef.value?.scrollEl ?? null);

const inputMode = ref<"touch" | "keyboard">("touch");

function setKeyboardMode(): void {
  if (inputMode.value !== "keyboard") {
    inputMode.value = "keyboard";
  }
}

function setTouchMode(): void {
  if (inputMode.value !== "touch") {
    inputMode.value = "touch";
  }
}

onMounted(() => {
  if (typeof window === "undefined") {
    return;
  }
  window.addEventListener("keydown", setKeyboardMode, { passive: true });
  window.addEventListener("pointerdown", setTouchMode, { passive: true });
  window.addEventListener("touchstart", setTouchMode, { passive: true });
});

onBeforeUnmount(() => {
  if (typeof window === "undefined") {
    return;
  }
  window.removeEventListener("keydown", setKeyboardMode);
  window.removeEventListener("pointerdown", setTouchMode);
  window.removeEventListener("touchstart", setTouchMode);
});

function openSwitcher(): void {
  showSwitcher.value = true;
}

function closeSwitcher(): void {
  showSwitcher.value = false;
}

watch(
  () => nav.depth.value,
  (depth) => {
    // auto-close so we don't leave a chrome-only dialog floating over
    if (depth === 0 && showSwitcher.value) {
      showSwitcher.value = false;
    }
  },
);

useShellBrowserChromeSync(activeBrowserPath, activeBrowserTitle);

const {
  addLaunching,
  clearLaunching,
  commitLaunched,
  lastLaunchedManifestId,
  launchingManifestIds,
} = useMobileLaunchState();

function manifestFor(manifestId: string): AppManifest | null {
  return kernel.apps.list().find((manifest) => manifest.id === manifestId) ?? null;
}

function manifestHasSettings(manifestId: string): boolean {
  const manifest = manifestFor(manifestId);
  return manifest !== null && hasAppSettings(manifest);
}

function unsupportedManifestFor(manifestId: string): AppManifest | null {
  const manifest = manifestFor(manifestId);

  if (!manifest || appSupportsShell(manifest, "mobile")) {
    return null;
  }

  return manifest;
}

function notifyUnsupportedManifest(manifest: AppManifest): void {
  toast.warning({
    title: "Not available on mobile",
    description: appUnsupportedShellMessage(manifest, "mobile"),
  });
}

function onLaunch(
  manifestId: string,
  args?: Readonly<Record<string, unknown>>,
  source: AppResumeSource = "api",
): void {
  const unsupported = unsupportedManifestFor(manifestId);

  if (unsupported) {
    showSwitcher.value = false;
    clearLaunching(manifestId);
    notifyUnsupportedManifest(unsupported);
    return;
  }

  const willResume = nav.stack.some((frame) => frame.manifestId === manifestId);

  if (!willResume) {
    addLaunching(manifestId);
  }

  void nav.launch(manifestId, args).then(
    () => {
      if (!willResume) {
        clearLaunching(manifestId);
      }
      if (willResume) {
        const emission = resolveAppResume({
          manifestId,
          ...(args === undefined ? {} : { args }),
          source,
          resolveHandleId: (id) => nav.stack.find((entry) => entry.manifestId === id)?.handleId,
          manifestHasSettings,
        });
        if (emission !== null) {
          emitAppResume(kernel.events, emission);
        }
      }
      commitLaunched(manifestId);
    },
    () => {
      clearLaunching(manifestId);
    },
  );
}

function onSpawnNew(manifestId: string, args?: Readonly<Record<string, unknown>>): void {
  const unsupported = unsupportedManifestFor(manifestId);

  if (unsupported) {
    showSwitcher.value = false;
    clearLaunching(manifestId);
    notifyUnsupportedManifest(unsupported);
    return;
  }
  addLaunching(manifestId);
  void nav.spawnNew(manifestId, args).then(
    () => {
      clearLaunching(manifestId);
      commitLaunched(manifestId);
    },
    () => {
      clearLaunching(manifestId);
    },
  );
}

async function onEditorOpenRequested(path: string): Promise<void> {
  const unsupported = unsupportedManifestFor("editor");

  if (unsupported) {
    showSwitcher.value = false;
    clearLaunching("editor");
    notifyUnsupportedManifest(unsupported);
    return;
  }

  const normalizedPath = normalizeEditorOpenPath(path);
  if (normalizedPath === null) {
    return;
  }

  const matchingFrame = topmostEditorFrame((frame) => documentPathFor(frame) === normalizedPath);
  if (matchingFrame !== null) {
    nav.focusFrame(matchingFrame.frameId);
    return;
  }

  const emptyFrame = topmostEditorFrame((frame) => frame.documentPath === null);
  if (emptyFrame !== null) {
    nav.focusFrame(emptyFrame.frameId);
    await nextTick();
    kernel.events.emit("editor.window.open.requested", {
      handleId: emptyFrame.handleId,
      path: normalizedPath,
    });
    commitLaunched("editor");
    return;
  }

  addLaunching("editor");
  try {
    await nav.spawnNew("editor", { path: normalizedPath });
    commitLaunched("editor");
  } finally {
    clearLaunching("editor");
  }
}

async function onBlogPostOpenRequested(path: string, slug: string): Promise<void> {
  const unsupported = unsupportedManifestFor("blog");

  if (unsupported) {
    showSwitcher.value = false;
    clearLaunching("blog");
    notifyUnsupportedManifest(unsupported);
    return;
  }

  const normalizedPath = normalizeOpenRequestPath("blog.post.open.requested", path);
  if (normalizedPath === null || !isBlogPostSlug(slug)) {
    if (!isBlogPostSlug(slug)) {
      debugWarn("[mobile-shell]", "blog.post.open.requested invalid slug", slug);
    }
    return;
  }

  const matchingFrame = topmostFrameForManifest(
    "blog",
    (frame) => documentPathFor(frame) === normalizedPath,
  );
  if (matchingFrame !== null) {
    nav.focusFrame(matchingFrame.frameId);
    return;
  }

  addLaunching("blog");
  try {
    await nav.spawnNew("blog", { path: normalizedPath, slug });
    commitLaunched("blog");
  } finally {
    clearLaunching("blog");
  }
}

async function onPdfViewerOpenRequested(path: string): Promise<void> {
  const unsupported = unsupportedManifestFor("pdf-viewer");

  if (unsupported) {
    showSwitcher.value = false;
    clearLaunching("pdf-viewer");
    notifyUnsupportedManifest(unsupported);
    return;
  }

  const normalizedPath = normalizeOpenRequestPath("pdf-viewer.open.requested", path);
  if (normalizedPath === null) {
    return;
  }

  const matchingFrame = topmostFrameForManifest(
    "pdf-viewer",
    (frame) => documentPathFor(frame) === normalizedPath,
  );
  if (matchingFrame !== null) {
    nav.focusFrame(matchingFrame.frameId);
    return;
  }

  addLaunching("pdf-viewer");
  try {
    await nav.spawnNew("pdf-viewer", { path: normalizedPath });
    commitLaunched("pdf-viewer");
  } finally {
    clearLaunching("pdf-viewer");
  }
}

function normalizeEditorOpenPath(path: string): string | null {
  return normalizeOpenRequestPath("editor.open.requested", path);
}

function normalizeOpenRequestPath(eventName: string, path: string): string | null {
  return normalizeShellOpenRequestPath("[mobile-shell]", eventName, path);
}

function topmostEditorFrame(
  predicate: (frame: (typeof nav.stack)[number]) => boolean,
): (typeof nav.stack)[number] | null {
  return topmostFrameForManifest("editor", predicate);
}

function topmostFrameForManifest(
  manifestId: string,
  predicate: (frame: (typeof nav.stack)[number]) => boolean,
): (typeof nav.stack)[number] | null {
  return preferredManifestFrame(nav.stack, nav.foreground.value, manifestId, predicate);
}

function onBack(): void {
  nav.goHome();
}

function onHide(): void {
  nav.goHome();
}

function onClose(frameId: string): void {
  nav.dismiss(frameId);
}

function onFrameTitle(handleId: string, manifestId: string, title: string | null): void {
  nav.setTitle(handleId, manifestId, title);
}

function onSelect(frameId: string): void {
  nav.focusFrame(frameId);
  closeSwitcher();
}

/**
 * AppSwitcher card dismiss. The switcher stays open after each
 * dismiss so the user can clean up several apps in a row; the
 * `depth → 0` watcher above auto-closes the dialog when the last frame
 * leaves so we don't strand a chrome-only overlay above an empty
 * HomeScreen.
 */
function onDismiss(frameId: string): void {
  nav.dismiss(frameId);
}

function onDismissAll(): void {
  nav.dismissAll();
}

watch(
  () => nav.foreground.value,
  async (next, prev) => {
    if (prev !== null && next === null && lastLaunchedManifestId.value !== null) {
      await nextTick();
      const id = lastLaunchedManifestId.value;
      if (typeof document !== "undefined" && id) {
        const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
        const icon = document.querySelector<HTMLButtonElement>(
          `.home-icon[data-manifest-id="${safeId}"]`,
        );
        icon?.focus({ preventScroll: true });
      }
    }
  },
);
</script>

<template>
  <div class="mobile-shell" :data-input-mode="inputMode" :style="homeLabelContrastStyle">
    <Wallpaper shell-id="mobile" sync-page-background />
    <div class="mobile-shell__body">
      <HomeScreen
        ref="homeRef"
        :aria-hidden="!isHome"
        :inert="!isHome"
        :recents-available="isHome && nav.depth.value > 0"
        :launching-manifest-ids="launchingManifestIds"
        @launch="onLaunch"
        @recents="openSwitcher"
      />
      <div class="mobile-shell__stack">
        <AppView
          v-for="frame in nav.stack"
          :key="frame.frameId"
          :frame="frame"
          :title="titleFor(frame.manifestId)"
          :is-current="frame.frameId === nav.foreground.value && !switcherActive"
          :is-foreground-frame="frame.frameId === nav.foreground.value"
          @back="onBack"
          @close="onClose(frame.frameId)"
          @hide="onHide"
          @recents="openSwitcher"
          @title:frame="onFrameTitle"
        />
      </div>
      <Transition name="app-switcher">
        <AppSwitcher
          v-if="switcherActive"
          :frames="nav.stack"
          @close="closeSwitcher"
          @select="onSelect"
          @dismiss="onDismiss"
          @dismiss-all="onDismissAll"
        />
      </Transition>
      <MobileSpotlightHost v-if="isHome" :scroll-container="homeScrollEl" />
    </div>
    <MobilePermissionPromptHost />
  </div>
</template>

<style scoped lang="scss">
.mobile-shell {
  --mobile-shell-safe-area-top: max(0px, env(safe-area-inset-top, 0px));
  --mobile-shell-safe-area-right: max(0px, env(safe-area-inset-right, 0px));
  --mobile-shell-safe-area-bottom: max(0px, env(safe-area-inset-bottom, 0px));
  --mobile-shell-safe-area-left: max(0px, env(safe-area-inset-left, 0px));

  block-size: 100vh;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  isolation: isolate;
  overflow: clip;
  position: relative;
}

.mobile-shell__body {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow: clip;
  position: relative;
}

.mobile-shell__stack {
  block-size: 100%;
  inline-size: 100%;
  inset: 0;
  overflow: clip;
  pointer-events: none; // child AppViews flip back to `auto`
  position: absolute;
}

// keyboard attached, hiding the focus ring for genuine keyboard users.
.mobile-shell[data-input-mode="touch"] {
  :deep(*:focus-visible) {
    outline: none !important;
    outline-offset: 0 !important;
  }
}

// position before the `enter-from` class applied (chunk-load race —
.app-switcher-enter-active,
.app-switcher-leave-active {
  transition:
    opacity 200ms var(--ease),
    transform 200ms var(--ease);
}

.app-switcher-enter-from,
.app-switcher-leave-to {
  opacity: 0;
  transform: translateY(24px);
}

@media (prefers-reduced-motion: reduce) {
  .app-switcher-enter-active,
  .app-switcher-leave-active {
    transition-duration: var(--duration-fast);
  }

  .app-switcher-enter-from,
  .app-switcher-leave-to {
    transform: none;
  }
}
</style>
