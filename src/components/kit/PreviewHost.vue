<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h } from "vue";

import { useKernel } from "~/runtime/sdk";
import type { AppPreviewInput, AppPreviewSurface } from "~/types/preview";

import EmptyState from "./EmptyState.vue";
import Spinner from "./Spinner.vue";

const props = withDefaults(
  defineProps<{
    readonly input: AppPreviewInput;
    readonly surface: AppPreviewSurface;
    readonly fallbackTitle?: string;
    readonly fallbackDescription?: string;
  }>(),
  {
    fallbackTitle: "Preview unavailable",
    fallbackDescription: "No app can preview this item yet.",
  },
);

const kernel = useKernel();

const resolution = computed(() =>
  kernel.previews.resolve(props.input, {
    surface: props.surface,
  }),
);

const previewComponent = computed(() => {
  const provider = resolution.value?.provider;
  if (provider === undefined) {
    return null;
  }

  return defineAsyncComponent({
    loader: () => provider.component().then((module) => module.default),
    loadingComponent: PreviewHostLoading,
    errorComponent: PreviewHostError,
    delay: 0,
    timeout: 10_000,
  });
});

const PreviewHostLoading = defineComponent({
  name: "PreviewHostLoading",
  setup() {
    return () =>
      h("div", { class: "ds-kit-preview-host__state" }, [
        h(Spinner, { size: "md", label: "Loading preview" }),
      ]);
  },
});

const PreviewHostError = defineComponent({
  name: "PreviewHostError",
  setup() {
    return () =>
      h(EmptyState, {
        class: "ds-kit-preview-host__state",
        role: "alert",
        title: "Preview failed",
        description: "The preview app could not be loaded.",
      });
  },
});
</script>

<template>
  <div class="ds-kit-preview-host" :data-preview-surface="surface">
    <component
      :is="previewComponent"
      v-if="previewComponent && resolution"
      :args="resolution.args"
      :input="input"
      :surface="surface"
    />
    <EmptyState
      v-else
      class="ds-kit-preview-host__state"
      :title="fallbackTitle"
      :description="fallbackDescription"
    />
  </div>
</template>

<style scoped lang="scss">
.ds-kit-preview-host {
  block-size: 100%;
  inline-size: 100%;
  min-block-size: 0;
  min-inline-size: 0;
}

.ds-kit-preview-host__state {
  block-size: 100%;
  min-block-size: 160px;
}
</style>
