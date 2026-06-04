<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  hasVideo: boolean;
  videoId: string | null;
}>();

const emit = defineEmits<{
  "host-change": [host: HTMLIFrameElement | null];
}>();

const host = ref<HTMLIFrameElement | null>(null);
const embedSrc = computed(() => {
  if (props.videoId === null) {
    return undefined;
  }

  const params = new URLSearchParams({
    controls: "0",
    enablejsapi: "1",
    playsinline: "1",
  });

  if (typeof window !== "undefined") {
    params.set("origin", window.location.origin);
  }

  return `https://www.youtube.com/embed/${encodeURIComponent(props.videoId)}?${params.toString()}`;
});

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
    <iframe
      :key="videoId ?? 'empty'"
      ref="host"
      class="youtube-player__embed"
      credentialless="credentialless"
      :src="embedSrc"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
      title="YouTube video player"
    />
  </div>
</template>

<style scoped lang="scss">
.youtube-player__embed-shell {
  block-size: 100%;
  inline-size: 100%;
  min-block-size: 0;
  overflow: hidden;
  position: relative;
}

.youtube-player__embed {
  block-size: 200%;
  border: 0;
  display: block;
  inset-block-start: -50%;
  inset-inline-start: 0;
  inline-size: 100%;
  position: absolute;
}
</style>
