import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";

import {
  autoCoverAspectRatioOverscan,
  coverAspectRatioBox,
  DEFAULT_VIDEO_ASPECT_RATIO,
  fitAspectRatioBox,
  normalizedAspectRatio,
  type AspectRatioFit,
  type AspectRatioOverscan,
  type BoxSize,
} from "../utils/aspectRatio";

export function useAspectFitBox(
  container: Readonly<Ref<HTMLElement | null>>,
  aspectRatio: Readonly<Ref<number | null>>,
  fit: Readonly<Ref<AspectRatioFit>> | AspectRatioFit = "contain",
  overscan: Readonly<Ref<AspectRatioOverscan>> | AspectRatioOverscan = 1,
) {
  const containerSize = ref<BoxSize>({ width: 0, height: 0 });

  let resizeObserver: ResizeObserver | null = null;

  const fitMode = computed(() => (typeof fit === "string" ? fit : fit.value));
  const overscanMultiplier = computed(() => {
    const value = typeof overscan === "object" ? overscan.value : overscan;
    if (value === "auto") {
      return fitMode.value === "cover"
        ? autoCoverAspectRatioOverscan(containerSize.value, resolvedAspectRatio.value)
        : 1;
    }

    if (!Number.isFinite(value)) {
      return 1;
    }

    return Math.max(1, Math.min(value, 2));
  });
  const resolvedAspectRatio = computed(
    () => normalizedAspectRatio(aspectRatio.value) ?? DEFAULT_VIDEO_ASPECT_RATIO,
  );
  const fittedBox = computed(() => {
    if (fitMode.value === "cover") {
      return coverAspectRatioBox(containerSize.value, resolvedAspectRatio.value);
    }

    return fitAspectRatioBox(containerSize.value, resolvedAspectRatio.value);
  });
  const style = computed<Record<string, string>>(() => {
    const nextStyle: Record<string, string> = {
      "--youtube-player-aspect-ratio": resolvedAspectRatio.value.toString(),
    };
    const box = fittedBox.value;

    if (box === null) {
      return nextStyle;
    }

    nextStyle.inlineSize = `${(box.width * overscanMultiplier.value).toString()}px`;
    nextStyle.blockSize = `${(box.height * overscanMultiplier.value).toString()}px`;

    return nextStyle;
  });

  function disconnectObserver(): void {
    resizeObserver?.disconnect();
    resizeObserver = null;
  }

  function setContainerSize(nextContainer: HTMLElement): void {
    const rect = nextContainer.getBoundingClientRect();
    containerSize.value = {
      width: rect.width,
      height: rect.height,
    };
  }

  function observeContainer(nextContainer: HTMLElement | null): void {
    disconnectObserver();

    if (nextContainer === null) {
      containerSize.value = { width: 0, height: 0 };
      return;
    }

    setContainerSize(nextContainer);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    resizeObserver = new ResizeObserver(([entry]) => {
      if (entry === undefined) {
        return;
      }

      containerSize.value = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
    });
    resizeObserver.observe(nextContainer);
  }

  watch(container, observeContainer, { flush: "post", immediate: true });
  onBeforeUnmount(disconnectObserver);

  return {
    fittedBox,
    resolvedAspectRatio,
    style,
  };
}
