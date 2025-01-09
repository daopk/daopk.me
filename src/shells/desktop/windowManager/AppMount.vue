<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, watch, provide } from "vue";

import { useKernel } from "~/composables/useKernel";
import { debugWarn } from "~/core/debug";
import { AppContextInjectionKey, type AppContext } from "~/types/app";

import AppMountError from "./AppMountError.vue";
import AppMountLoading from "./AppMountLoading.vue";

const props = defineProps<{
  manifestId: string;
  handleId: string;
  focused: boolean;
  args?: Record<string, unknown>;
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

const resolvedComponent = manifest.value
  ? defineAsyncComponent({
      loader: manifest.value.component,
      loadingComponent: AppMountLoading,
      errorComponent: AppMountError,
      delay: 0,
      timeout: 10_000,
      onError(err, _retry, fail) {
        emitProcessErrored(err);
        fail();
      },
    })
  : undefined;

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
