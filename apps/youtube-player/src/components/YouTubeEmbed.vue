<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

defineProps<{
  hasVideo: boolean;
  videoId: string | null;
}>();

const emit = defineEmits<{
  "host-change": [host: HTMLElement | null];
}>();

const host = ref<HTMLElement | null>(null);

watch(host, (nextHost) => emit("host-change", nextHost), {
  immediate: true,
  flush: "post",
});

onBeforeUnmount(() => {
  emit("host-change", null);
});
</script>

<template>
  <div v-if="hasVideo" class="youtube-player__embed-shell">
    <div :key="videoId ?? 'empty'" ref="host" class="youtube-player__embed" />
  </div>
</template>

<style scoped lang="scss">
.youtube-player__embed-shell,
.youtube-player__embed {
  block-size: 100%;
  inline-size: 100%;
  min-block-size: 0;
}

.youtube-player__embed-shell {
  overflow: hidden;
  position: relative;
}

.youtube-player__embed {
  inset: 0;
  position: absolute;
}

.youtube-player__embed-shell :deep(iframe) {
  block-size: 200%;
  border: 0;
  display: block;
  inset-block-start: -50%;
  inset-inline-start: 0;
  inline-size: 100%;
  position: absolute;
}
</style>
