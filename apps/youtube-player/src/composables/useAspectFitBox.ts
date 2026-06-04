import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";

import {
  DEFAULT_VIDEO_ASPECT_RATIO,
  fitAspectRatioBox,
  normalizedAspectRatio,
  type BoxSize,
} from "../utils/aspectRatio";

export function useAspectFitBox(
  container: Readonly<Ref<HTMLElement | null>>,
  aspectRatio: Readonly<Ref<number | null>>,
) {
  const containerSize = ref<BoxSize>({ width: 0, height: 0 });

  let resizeObserver: ResizeObserver | null = null;

  const resolvedAspectRatio = computed(
    () => normalizedAspectRatio(aspectRatio.value) ?? DEFAULT_VIDEO_ASPECT_RATIO,
  );
  const fittedBox = computed(() =>
    fitAspectRatioBox(containerSize.value, resolvedAspectRatio.value),
  );
  const style = computed<Record<string, string>>(() => {
    const nextStyle: Record<string, string> = {
      "--youtube-player-aspect-ratio": resolvedAspectRatio.value.toString(),
    };
    const box = fittedBox.value;

    if (box === null) {
      return nextStyle;
    }

    nextStyle.inlineSize = `${box.width.toString()}px`;
    nextStyle.blockSize = `${box.height.toString()}px`;

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
