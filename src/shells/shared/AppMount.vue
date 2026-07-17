<script setup vapor lang="ts">
import { computed, defineAsyncComponent, onMounted, watch, provide, shallowRef } from "vue";

import { useKernel } from "~/composables/useKernel";
import { debugWarn } from "~/core/debug";
import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  type AppChromeController,
  type AppContext,
} from "~/types/app";

import { AppMountRetryKey } from "./appMountContext";
import AppMountError from "./AppMountError.vue";
import AppMountLoading from "./AppMountLoading.vue";

const props = defineProps<{
  manifestId: string;
  handleId: string;
  focused: boolean;
  args?: Record<string, unknown>;
  chrome?: AppChromeController;
}>();

const kernel = useKernel();

const manifest = computed(() => kernel.apps.list().find((entry) => entry.id === props.manifestId));

// Deep-freeze the args snapshot — `Object.freeze` is shallow, so without the
// Singleton relaunch / shell-policy short-circuits intentionally drop new
const context: AppContext = Object.freeze({
  manifestId: props.manifestId,
  handleId: props.handleId,
  args: Object.freeze({ ...props.args }),
});

provide(AppContextInjectionKey, context);

if (props.chrome !== undefined) {
  provide(AppChromeInjectionKey, props.chrome);
}

/**
 * Normalize an unknown thrown value into the structured-clone-safe shape
 * `process.errored` carries (`{ name, message }`). Strings, Errors, and
 * plain objects all flow through this single helper so the channel never
 * receives heterogeneous payloads.
 */
function normalizeError(err: unknown): { name: string; message: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }

  if (typeof err === "string") {
    return { name: "Error", message: err };
  }

  return { name: "Error", message: String(err) };
}

function emitProcessErrored(err: unknown): void {
  kernel.events.emit("process.errored", {
    handleId: props.handleId,
    manifestId: props.manifestId,
    error: normalizeError(err),
  });
}

function createResolvedComponent() {
  const loader = manifest.value?.component;
  if (loader === undefined) {
    return undefined;
  }

  return defineAsyncComponent({
    loader,
    loadingComponent: AppMountLoading,
    errorComponent: AppMountError,
    delay: 0,
    timeout: 10_000,
    onError(err, _retry, fail) {
      emitProcessErrored(err);
      fail();
    },
  });
}

// Stored in a ref so a manual retry can swap in a *fresh* async wrapper. Vue's
// `defineAsyncComponent` caches its rejected request in a closure, so simply
// remounting the same wrapper would re-throw the cached error; recreating it
// gives the loader a clean attempt.
const resolvedComponent = shallowRef(createResolvedComponent());

function retryLoad(): void {
  const next = createResolvedComponent();
  if (next !== undefined) {
    resolvedComponent.value = next;
  }
}

provide(AppMountRetryKey, manifest.value ? retryLoad : null);

onMounted(() => {
  if (!manifest.value) {
    debugWarn("[app-mount] unknown manifest at mount", props.manifestId);
    emitProcessErrored(new Error(`Unknown manifest: ${props.manifestId}`));
  }

  kernel.lifecycleCoordinator.emit("mounted", props.handleId);

  if (props.focused) {
    kernel.lifecycleCoordinator.emit("activated", props.handleId);
  }
});

watch(
  () => props.focused,
  (next, prev) => {
    if (next === prev) {
      return;
    }

    kernel.lifecycleCoordinator.emit(next ? "activated" : "deactivated", props.handleId);
  },
);
</script>

<template>
  <div class="app-mount">
    <component :is="resolvedComponent" v-if="resolvedComponent" />
    <AppMountError v-else />
  </div>
</template>

<style scoped lang="scss">
.app-mount {
  block-size: 100%;
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  min-block-size: 0;
}

.app-mount > * {
  flex: 1;
  min-block-size: 0;
}
</style>
