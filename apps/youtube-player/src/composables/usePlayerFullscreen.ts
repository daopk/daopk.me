import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

export function usePlayerFullscreen(target: Ref<HTMLElement | null>) {
  const fullscreen = ref(false);

  function syncFullscreenState(): void {
    fullscreen.value =
      typeof document !== "undefined" && document.fullscreenElement === target.value;
  }

  function toggleFullscreen(): void {
    const element = target.value;
    if (element === null || typeof document === "undefined") {
      return;
    }

    if (document.fullscreenElement === element) {
      void document.exitFullscreen?.();
    } else {
      void element.requestFullscreen?.();
    }
  }

  onMounted(() => {
    document.addEventListener("fullscreenchange", syncFullscreenState);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("fullscreenchange", syncFullscreenState);
  });

  return {
    fullscreen,
    toggleFullscreen,
  };
}
