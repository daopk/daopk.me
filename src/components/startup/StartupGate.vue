<script setup vapor lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import BootHost from "~/components/boot/BootHost.vue";
import { useBreakpoint } from "~/composables/useBreakpoint";
import { createProfileLifecycle } from "~/core/profile/ProfileLifecycle";
import { clearActiveProfileSession, useActiveProfileSession } from "~/core/profile/ProfileSession";
import {
  DEFAULT_WALLPAPER_DESKTOP_URL,
  DEFAULT_WALLPAPER_MOBILE_URL,
} from "~/core/theme/wallpapers";
import {
  isBlockingServiceWorkerUpdate,
  serviceWorkerUpdateController,
} from "~/service-worker/updateController";

import BlockingUpdateScreen from "./BlockingUpdateScreen.vue";
import { useBlockingAutoUpdate } from "./useBlockingAutoUpdate";

const props = defineProps<{
  updatePreflight?: Promise<void>;
}>();

const lifecycle = createProfileLifecycle();
const breakpoint = useBreakpoint();
const activeProfile = useActiveProfileSession();
const autoUpdate = useBlockingAutoUpdate(computed(() => activeProfile.value === null));

const bootstrapping = ref(false);
const bootstrapFailed = ref(false);
const bootstrapError = ref("");
const startupStyle = computed<Record<string, string>>(() => ({
  backgroundImage: [
    "linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 34%, transparent) 0%, color-mix(in srgb, var(--color-bg) 72%, transparent) 100%)",
    `url("${
      breakpoint.isMobile.value ? DEFAULT_WALLPAPER_MOBILE_URL : DEFAULT_WALLPAPER_DESKTOP_URL
    }")`,
  ].join(", "),
}));

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Local profile setup failed.";
}

function hasBlockingUpdate(): boolean {
  return isBlockingServiceWorkerUpdate(serviceWorkerUpdateController.state.value);
}

function activeProfileId(): string | null {
  return activeProfile.value?.profileId ?? null;
}

async function bootstrap(): Promise<void> {
  if (activeProfile.value !== null || autoUpdate.visible.value || bootstrapping.value) {
    return;
  }

  bootstrapping.value = true;
  bootstrapFailed.value = false;
  bootstrapError.value = "";

  try {
    await props.updatePreflight;
    if (activeProfile.value !== null || hasBlockingUpdate()) {
      return;
    }

    const session = await lifecycle.bootstrapGuest();
    const updateState = serviceWorkerUpdateController.state.value;
    if (activeProfileId() === session.profileId && isBlockingServiceWorkerUpdate(updateState)) {
      clearActiveProfileSession();
      if (updateState.kind === "update-available") {
        void serviceWorkerUpdateController.refresh();
      }
    }
  } catch (error: unknown) {
    bootstrapFailed.value = true;
    bootstrapError.value = describeError(error);
  } finally {
    bootstrapping.value = false;
  }
}

watch(
  () => [activeProfile.value, autoUpdate.visible.value] as const,
  ([profile, updateVisible]) => {
    if (!profile && !updateVisible) {
      void bootstrap();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  lifecycle.dispose();
});
</script>

<template>
  <main class="startup-gate" :style="startupStyle" aria-label="Starting WebOS">
    <BlockingUpdateScreen
      v-if="autoUpdate.visible.value"
      title-id="startup-title"
      :failed="autoUpdate.failed.value"
      :error-message="autoUpdate.errorMessage.value"
      @retry="autoUpdate.retry"
    />

    <BootHost
      v-else
      :progress-fraction="bootstrapFailed ? 0 : 0.12"
      :phase-label="bootstrapFailed ? '' : 'Preparing local profile…'"
      :boot-status="bootstrapFailed ? 'failed' : 'running'"
      :error-message="bootstrapError"
      @retry="bootstrap"
    />
  </main>
</template>

<style scoped lang="scss">
.startup-gate {
  background-color: var(--color-bg);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  block-size: 100vh;
  color: var(--color-fg);
  display: grid;
  inset: 0;
  padding: clamp(var(--space-lg), 5vw, 56px);
  place-items: center;
  position: fixed;
}

@media (max-width: 760px) {
  .startup-gate {
    padding: calc(env(safe-area-inset-top, 0px) + 40px)
      calc(env(safe-area-inset-right, 0px) + var(--space-lg))
      calc(env(safe-area-inset-bottom, 0px) + 40px)
      calc(env(safe-area-inset-left, 0px) + var(--space-lg));
  }
}
</style>
