<script setup vapor lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    hasVideo: boolean;
    interactive?: boolean;
    muted?: boolean;
    privacyEnhanced?: boolean;
    videoId: string | null;
  }>(),
  {
    interactive: true,
    muted: false,
    privacyEnhanced: false,
  },
);

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
    disablekb: props.interactive ? "0" : "1",
    enablejsapi: "1",
    fs: props.interactive ? "1" : "0",
    iv_load_policy: "3",
    rel: "0",
    playsinline: "1",
  });

  if (typeof window !== "undefined") {
    params.set("origin", window.location.origin);
  }

  if (props.muted) {
    params.set("mute", "1");
  }

  const origin = props.privacyEnhanced
    ? "https://www.youtube-nocookie.com"
    : "https://www.youtube.com";
  return `${origin}/embed/${encodeURIComponent(props.videoId)}?${params.toString()}`;
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
      :class="{ 'youtube-player__embed--noninteractive': !interactive }"
      credentialless="credentialless"
      :src="embedSrc"
      allow="autoplay; encrypted-media; picture-in-picture"
      :allowfullscreen="interactive"
      :aria-hidden="interactive ? undefined : 'true'"
      referrerpolicy="strict-origin-when-cross-origin"
      :tabindex="interactive ? undefined : -1"
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

.youtube-player__embed--noninteractive {
  pointer-events: none;
}
</style>
