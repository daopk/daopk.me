import { computed, onBeforeUnmount, onMounted, ref, type ComponentPublicInstance } from "vue";

import type { BabyTouchPointerMode } from "./babyTouchPointer";

interface BabyTouchBodySize {
  readonly inlineSize: number;
  readonly blockSize: number;
}

function readMobileShell(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.shell === "mobile";
}

export function useBabyTouchOrientation() {
  const orientationViewport = ref<HTMLElement | null>(null);
  const mobileShell = ref(false);
  const appBodySize = ref<BabyTouchBodySize>({ inlineSize: 0, blockSize: 0 });

  let resizeObserver: ResizeObserver | null = null;
  let shellObserver: MutationObserver | null = null;

  const forceLandscapeRight = computed(
    () =>
      mobileShell.value &&
      appBodySize.value.inlineSize > 0 &&
      appBodySize.value.blockSize > appBodySize.value.inlineSize,
  );
  const pointerMode = computed<BabyTouchPointerMode>(() =>
    forceLandscapeRight.value ? "landscape-right" : "natural",
  );
  const orientationStyle = computed<Record<string, string>>(() => ({
    "--baby-touch-viewport-inline-size": `${appBodySize.value.inlineSize}px`,
    "--baby-touch-viewport-block-size": `${appBodySize.value.blockSize}px`,
  }));

  function refreshMobileShell(): void {
    mobileShell.value = readMobileShell();
  }

  function updateAppBodySize(width: number, height: number): void {
    const inlineSize = Math.max(0, width);
    const blockSize = Math.max(0, height);

    if (appBodySize.value.inlineSize === inlineSize && appBodySize.value.blockSize === blockSize) {
      return;
    }

    appBodySize.value = { inlineSize, blockSize };
  }

  function measureAppBody(): void {
    const viewport = orientationViewport.value;
    if (viewport === null) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    updateAppBodySize(rect.width, rect.height);
  }

  function refreshOrientation(): void {
    refreshMobileShell();
    measureAppBody();
  }

  function setOrientationViewport(element: Element | ComponentPublicInstance | null): void {
    orientationViewport.value = element instanceof HTMLElement ? element : null;
  }

  onMounted(() => {
    refreshOrientation();

    if (typeof ResizeObserver === "function" && orientationViewport.value !== null) {
      resizeObserver = new ResizeObserver(measureAppBody);
      resizeObserver.observe(orientationViewport.value);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", refreshOrientation);
      window.addEventListener("orientationchange", refreshOrientation);
    }

    if (typeof MutationObserver === "function" && typeof document !== "undefined") {
      shellObserver = new MutationObserver(refreshMobileShell);
      shellObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-shell"],
      });
    }
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    shellObserver?.disconnect();
    shellObserver = null;

    if (typeof window !== "undefined") {
      window.removeEventListener("resize", refreshOrientation);
      window.removeEventListener("orientationchange", refreshOrientation);
    }
  });

  return {
    forceLandscapeRight,
    orientationStyle,
    pointerMode,
    setOrientationViewport,
  };
}
