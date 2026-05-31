<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import Wallpaper from "~/components/wallpaper/Wallpaper.vue";
import HomeScreen from "./homeScreen/HomeScreen.vue";
import AppView from "./AppView.vue";
import AppSwitcher from "./appSwitcher/AppSwitcher.vue";
import MobilePermissionPromptHost from "./permissionPrompt/MobilePermissionPromptHost.vue";
import MobileSpotlightHost from "./spotlight/MobileSpotlightHost.vue";
import { useKernel } from "~/composables/useKernel";
import { useWallpaperLabelContrast } from "~/composables/useWallpaperLabelContrast";
import { hasAppSettings } from "~/core/apps/appSettings";
import { appSupportsShell, appUnsupportedShellMessage } from "~/core/apps/shellSupport";
import { emitAppResume, resolveAppResume, type AppResumeSource } from "~/core/routing/appResume";
import { useMobileNavigation } from "./useMobileNavigation";
import { useAppViewTitle } from "./useAppViewTitle";
import type { AppManifest } from "~/types/app";

const kernel = useKernel();
const nav = useMobileNavigation();
const { titleFor } = useAppViewTitle();
const homeLabelContrastStyle = useWallpaperLabelContrast("mobile");

const disposeLaunchListener = kernel.events.on("app.launch.requested", (payload) => {
  onLaunch(payload.manifestId, payload.args, payload.source);
});

const disposeSpawnNewListener = kernel.events.on("app.spawn.new", (payload) => {
  onSpawnNew(payload.manifestId, payload.args);
});

const showSwitcher = ref(false);

const switcherActive = computed(() => showSwitcher.value && nav.depth.value > 0);

const isHome = computed(() => nav.foreground.value === null);

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
  disposeLaunchListener();
  disposeSpawnNewListener();
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

const lastLaunchedManifestId = ref<string | null>(null);

const launchingManifestIds = ref<ReadonlySet<string>>(new Set<string>());

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

function alertUnsupportedManifest(manifest: AppManifest): void {
  const message = appUnsupportedShellMessage(manifest, "mobile");
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(message);
  }
}

function addLaunching(manifestId: string): void {
  const next = new Set(launchingManifestIds.value);
  next.add(manifestId);
  launchingManifestIds.value = next;
}

function clearLaunching(manifestId: string): void {
  if (!launchingManifestIds.value.has(manifestId)) {
    return;
  }
  const next = new Set(launchingManifestIds.value);
  next.delete(manifestId);
  launchingManifestIds.value = next;
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
    alertUnsupportedManifest(unsupported);
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
      lastLaunchedManifestId.value = manifestId;
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
    alertUnsupportedManifest(unsupported);
    return;
  }
  addLaunching(manifestId);
  void nav.spawnNew(manifestId, args).then(
    () => {
      clearLaunching(manifestId);
      lastLaunchedManifestId.value = manifestId;
    },
    () => {
      clearLaunching(manifestId);
    },
  );
}

function onBack(): void {
  nav.goHome();
}

function onHide(): void {
  nav.goHome();
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
    <Wallpaper shell-id="mobile" />
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
          :aria-hidden="switcherActive ? 'true' : undefined"
          :inert="switcherActive ? true : undefined"
          @back="onBack"
          @hide="onHide"
          @recents="openSwitcher"
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
  block-size: 100dvh;
  color: var(--color-fg);
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  isolation: isolate;
  overflow: hidden;
  position: relative;
}

.mobile-shell__body {
  flex: 1 1 auto;
  min-block-size: 0;
  position: relative;
}

.mobile-shell__stack {
  block-size: 100%;
  inline-size: 100%;
  inset: 0;
  pointer-events: none; // child AppViews flip back to `auto`
  position: absolute;
}

.mobile-shell__stack > * {
  pointer-events: auto;
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
