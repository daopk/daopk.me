<script setup vapor lang="ts">
import { computed, defineVaporAsyncComponent } from "vue";

import { useKernel } from "~/runtime/sdk";
import type { AppPreviewInput, AppPreviewSurface } from "~/types/preview";
import { verifiedVaporLoader } from "~/utils/vaporComponent";

import EmptyState from "./EmptyState.vue";
import PreviewHostError from "./PreviewHostError.vue";
import PreviewHostLoading from "./PreviewHostLoading.vue";

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

const emit = defineEmits<{
  "aspect-ratio-change": [aspectRatio: number | null];
  ended: [];
  playing: [];
}>();

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

  return defineVaporAsyncComponent({
    loader: () =>
      verifiedVaporLoader(provider.component, `Preview provider ${provider.id}`)().then(
        (module) => module.default,
      ),
    loadingComponent: PreviewHostLoading,
    errorComponent: PreviewHostError,
    delay: 0,
    timeout: 10_000,
  });
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
      @aspect-ratio-change="emit('aspect-ratio-change', $event)"
      @ended="emit('ended')"
      @playing="emit('playing')"
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
