<script setup vapor lang="ts">
import { computed, inject, reactive, ref, watch } from "vue";
import { TeleportProvider } from "ropav/teleport-provider";
import { ToastProvider } from "ropav/toast";

import BootHost from "~/components/boot/BootHost.vue";
import StartupGate from "~/components/startup/StartupGate.vue";
import ToastHost from "~/components/ui/ToastHost.vue";
import { APP_OVERLAY_PORTAL_ID, APP_OVERLAY_PORTAL_TARGET } from "~/components/ui/portalTarget";

import type { BootManager } from "~/core";
import { BootManagerInjectionKey } from "~/core";
import { useActiveProfileSession } from "~/core/profile/ProfileSession";
import { registerAppServiceWorker } from "~/service-worker/register";
import {
  isBlockingServiceWorkerUpdate,
  serviceWorkerUpdateController,
} from "~/service-worker/updateController";
import ShellHost from "~/shells/ShellHost.vue";

import { useKernel } from "~/composables/useKernel";

const kernel = useKernel();

const bootReactive = reactive(kernel.boot);

const bootManager = inject<BootManager | null>(BootManagerInjectionKey, null);
const activeProfile = useActiveProfileSession();
const hasActiveProfile = computed(() => activeProfile.value !== null);
const showBootHost = computed(() => hasActiveProfile.value && bootReactive.status !== "complete");
const showShellHost = computed(() => hasActiveProfile.value && bootReactive.status === "complete");
const { initialUpdateDiscovery } = registerAppServiceWorker();
const updatePreflightComplete = ref(false);
const updateBlocksBoot = computed(() =>
  isBlockingServiceWorkerUpdate(serviceWorkerUpdateController.state.value),
);

void initialUpdateDiscovery.then(() => {
  updatePreflightComplete.value = true;
});

async function bootActiveProfile(): Promise<void> {
  if (!bootManager) {
    return;
  }

  await bootManager.boot();
}

async function handleBootRetry(): Promise<void> {
  if (bootReactive.status !== "failed") {
    return;
  }

  if (!bootManager) {
    return;
  }

  bootManager.reset();

  await bootManager.boot();
}

watch(
  () =>
    [
      activeProfile.value,
      bootReactive.status,
      updatePreflightComplete.value,
      updateBlocksBoot.value,
    ] as const,
  ([profile, bootStatus, preflightComplete, updateBlocked]) => {
    if (
      profile === null ||
      !preflightComplete ||
      updateBlocked ||
      bootStatus === "complete" ||
      bootStatus === "failed"
    ) {
      return;
    }

    void bootActiveProfile();
  },
  { immediate: true },
);
</script>

<template>
  <TeleportProvider :teleport-to="APP_OVERLAY_PORTAL_TARGET">
    <ToastProvider :max="5" :duration="5000" radius="md" close-label="Dismiss notification">
      <div class="app-stage">
        <div
          :id="APP_OVERLAY_PORTAL_ID"
          class="app-stage__overlays"
          role="region"
          aria-label="Application overlays"
        />
        <!-- `failed` renders BootHost error chrome + Retry; `cancelled` is idle BootHost (HMR teardown). -->
        <BootHost
          v-if="showBootHost"
          key="boot"
          :progress-fraction="bootReactive.progressFraction"
          :phase-label="bootReactive.phaseLabel"
          :boot-status="bootReactive.status"
          :error-message="bootReactive.error?.message"
          @retry="handleBootRetry"
        />
        <ShellHost v-else-if="showShellHost" key="shell-hosted" />
        <ToastHost />

        <Transition name="startup-gate-lift">
          <StartupGate
            v-if="!hasActiveProfile"
            key="startup"
            class="app-stage__startup-gate"
            :update-preflight="initialUpdateDiscovery"
          />
        </Transition>
      </div>
    </ToastProvider>
  </TeleportProvider>
</template>

<style scoped lang="scss">
.app-stage {
  block-size: 100vh;
  overflow: hidden;
  position: relative;
}

.app-stage__overlays:empty {
  display: none;
}

.app-stage__startup-gate {
  inset: 0;
  position: fixed;
  z-index: 10;
}

.startup-gate-lift-enter-active {
  transition: none;
}

.startup-gate-lift-leave-active {
  pointer-events: none;
  transition: transform 260ms linear;
  will-change: transform;
}

.startup-gate-lift-enter-from,
.startup-gate-lift-enter-to,
.startup-gate-lift-leave-from {
  transform: translateY(0);
}

.startup-gate-lift-leave-to {
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .startup-gate-lift-leave-active {
    transition: none;
  }

  .startup-gate-lift-leave-to {
    transform: none;
  }
}
</style>
