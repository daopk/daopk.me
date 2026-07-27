<script setup vapor lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import Wallpaper from "~/components/wallpaper/Wallpaper.vue";
import { useToast } from "~/components/ui";
import { useKernel } from "~/composables/useKernel";
import { useWallpaperLabelContrast } from "~/composables/useWallpaperLabelContrast";
import { useShellBrowserChromeSync } from "~/shells/shared/useShellBrowserChromeSync";

import AppSwitcher from "./appSwitcher/AppSwitcher.vue";
import AppView from "./AppView.vue";
import HomeScreen from "./homeScreen/HomeScreen.vue";
import MobilePermissionPromptHost from "./permissionPrompt/MobilePermissionPromptHost.vue";
import MobileSpotlightHost from "./spotlight/MobileSpotlightHost.vue";
import { useMobileManifestProjection, type MobileManifest } from "./useMobileManifestProjection";
import { useMobileSession } from "./useMobileSession";

const kernel = useKernel();
const toast = useToast();
const manifests = useMobileManifestProjection(kernel);
const allManifests = manifests.all;
const launcherManifests = manifests.launcher;
const homeLabelContrastStyle = useWallpaperLabelContrast("mobile");

const session = useMobileSession({
  kernel,
  manifests,
  notifyUnsupported(manifest: MobileManifest): void {
    toast.warning({
      title: "Not available on mobile",
      description: manifest.unsupportedMessage ?? `${manifest.name} is not available on mobile.`,
    });
  },
  restoreHomeFocus(manifestId: string): void {
    if (typeof document === "undefined") {
      return;
    }
    const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(manifestId) : manifestId;
    document
      .querySelector<HTMLButtonElement>(`.home-icon[data-manifest-id="${safeId}"]`)
      ?.focus({ preventScroll: true });
  },
});
const mobile = session.state;

useShellBrowserChromeSync(
  computed(() => mobile.value.browserPath),
  computed(() => mobile.value.browserTitle),
);

interface HomeScreenInstance {
  readonly scrollEl: HTMLElement | null;
}
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

function onLaunch(manifestId: string): void {
  session.send({ type: "launch-app", manifestId });
}

function goHome(): void {
  session.send({ type: "go-home" });
}

function openRecents(): void {
  session.send({ type: "open-recents" });
}

function closeRecents(): void {
  session.send({ type: "close-recents" });
}

function onSelect(frameId: string): void {
  session.send({ type: "select-recent", frameId });
}

function onDismiss(frameId: string): void {
  session.send({ type: "dismiss", frameId });
}

function onDismissAll(): void {
  session.send({ type: "dismiss-all" });
}

function onFrameTitle(handleId: string, manifestId: string, title: string | null): void {
  session.send({ type: "set-title", handleId, manifestId, title });
}
</script>

<template>
  <div class="mobile-shell" :data-input-mode="inputMode" :style="homeLabelContrastStyle">
    <Wallpaper shell-id="mobile" sync-page-background />
    <div class="mobile-shell__body">
      <HomeScreen
        ref="homeRef"
        :manifests="launcherManifests"
        :aria-hidden="!mobile.homeVisible"
        :inert="!mobile.homeVisible"
        :recents-available="mobile.recentsAvailable"
        :launching-manifest-ids="mobile.launchingManifestIds"
        @launch="onLaunch"
        @recents="openRecents"
      />
      <div class="mobile-shell__stack">
        <AppView
          v-for="frame in mobile.frames"
          :key="frame.frameId"
          :frame="frame"
          :manifest="manifests.find(frame.manifestId)"
          :is-current="frame.frameId === mobile.foregroundFrameId && !mobile.recentsVisible"
          :is-foreground-frame="frame.frameId === mobile.foregroundFrameId"
          @back="goHome"
          @close="onDismiss(frame.frameId)"
          @hide="goHome"
          @recents="openRecents"
          @title:frame="onFrameTitle"
        />
      </div>
      <Transition name="app-switcher">
        <AppSwitcher
          v-if="mobile.recentsVisible"
          :frames="mobile.frames"
          :manifests="allManifests"
          @close="closeRecents"
          @select="onSelect"
          @dismiss="onDismiss"
          @dismiss-all="onDismissAll"
        />
      </Transition>
      <MobileSpotlightHost v-if="mobile.homeVisible" :scroll-container="homeScrollEl" />
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
