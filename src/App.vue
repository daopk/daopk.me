<script setup lang="ts">
import { computed, inject, nextTick, onMounted, reactive, ref, watch } from "vue";

import AuthGate from "~/components/auth/AuthGate.vue";
import BootHost from "~/components/boot/BootHost.vue";

import type { BootManager } from "~/core";
import { BootManagerInjectionKey } from "~/core";
import { useActiveProfileSession } from "~/core/profile/ProfileSession";
import { registerAppServiceWorker } from "~/service-worker/register";
import ShellHost from "~/shells/ShellHost.vue";

import { useKernel } from "~/composables/useKernel";

const kernel = useKernel();

const bootReactive = reactive(kernel.boot);

const bootManager = inject<BootManager | null>(BootManagerInjectionKey, null);
const activeProfile = useActiveProfileSession();
const hasActiveProfile = computed(() => activeProfile.value !== null);
const showBootHost = computed(() => hasActiveProfile.value && bootReactive.status !== "complete");
const showShellHost = computed(() => hasActiveProfile.value && bootReactive.status === "complete");
const canDismissAuthGate = computed(
  () =>
    hasActiveProfile.value &&
    (bootReactive.status === "complete" || bootReactive.status === "failed"),
);

const authGateVisible = ref(!activeProfile.value);
let authGateExitRequest = 0;

let serviceWorkerRegistered = false;

function registerServiceWorkerOnce(): void {
  if (serviceWorkerRegistered) {
    return;
  }
  serviceWorkerRegistered = true;
  registerAppServiceWorker();
}

async function handleAuthenticated(): Promise<void> {
  if (!bootManager) {
    registerServiceWorkerOnce();
    return;
  }

  await bootManager.boot().finally(() => {
    registerServiceWorkerOnce();
  });
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

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

async function scheduleAuthGateExit(): Promise<void> {
  const requestId = ++authGateExitRequest;

  await nextTick();
  await waitForAnimationFrame();

  if (requestId !== authGateExitRequest || !canDismissAuthGate.value) {
    return;
  }

  authGateVisible.value = false;
}

onMounted(() => {
  registerServiceWorkerOnce();
});

watch(
  () => [activeProfile.value, bootReactive.status] as const,
  () => {
    if (!hasActiveProfile.value) {
      authGateExitRequest += 1;
      authGateVisible.value = true;
      return;
    }

    if (canDismissAuthGate.value) {
      void scheduleAuthGateExit();
    }
  },
  { immediate: true },
);
</script>

<template>
  <Suspense>
    <div class="app-stage">
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

      <Transition name="auth-gate-lift">
        <AuthGate
          v-if="authGateVisible"
          key="auth"
          class="app-stage__auth-gate"
          @authenticated="handleAuthenticated"
        />
      </Transition>
    </div>
  </Suspense>
</template>

<style scoped lang="scss">
.app-stage {
  min-block-size: 100vh;
  overflow: hidden;
  position: relative;
}

@supports (min-block-size: 100svh) {
  .app-stage {
    min-block-size: 100svh;
  }
}

.app-stage__auth-gate {
  inset: 0;
  position: fixed;
  z-index: 10;
}

.auth-gate-lift-enter-active {
  transition: none;
}

.auth-gate-lift-leave-active {
  pointer-events: none;
  transition: transform 260ms linear;
  will-change: transform;
}

.auth-gate-lift-enter-from,
.auth-gate-lift-enter-to,
.auth-gate-lift-leave-from {
  transform: translateY(0);
}

.auth-gate-lift-leave-to {
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .auth-gate-lift-leave-active {
    transition: none;
  }

  .auth-gate-lift-leave-to {
    transform: none;
  }
}
</style>
