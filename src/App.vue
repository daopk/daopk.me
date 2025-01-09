<script setup lang="ts">
import { inject, onMounted, reactive } from "vue";

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

onMounted(() => {
  registerServiceWorkerOnce();
});
</script>

<template>
  <Suspense>
    <Transition mode="out-in" name="boot-shell">
      <AuthGate v-if="!activeProfile" key="auth" @authenticated="handleAuthenticated" />
      <!-- `failed` renders BootHost error chrome + Retry; `cancelled` is idle BootHost (HMR teardown). -->
      <BootHost
        v-else-if="bootReactive.status !== 'complete'"
        key="boot"
        :progress-fraction="bootReactive.progressFraction"
        :phase-label="bootReactive.phaseLabel"
        :boot-status="bootReactive.status"
        @retry="handleBootRetry"
      />
      <ShellHost v-else key="shell-hosted" />
    </Transition>
  </Suspense>
</template>

<style scoped lang="scss">
.boot-shell-enter-active,
.boot-shell-leave-active {
  transition:
    opacity 0.42s ease,
    transform 0.42s ease;
}

.boot-shell-enter-from,
.boot-shell-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (prefers-reduced-motion: reduce) {
  .boot-shell-enter-active,
  .boot-shell-leave-active {
    transition: opacity 0.18s linear;
  }

  .boot-shell-enter-from,
  .boot-shell-leave-to {
    opacity: 0;
    transform: none;
  }
}
</style>
