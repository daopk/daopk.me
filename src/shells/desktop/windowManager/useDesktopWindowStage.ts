import { computed, reactive, useTemplateRef } from "vue";
import { useElementBounding, useResizeObserver } from "@vueuse/core";

import { dockReveal, measureDockReveal } from "~/shells/desktop/dock/dockReveal";

import {
  DEFAULT_H,
  DEFAULT_W,
  MIN_H,
  MIN_W,
  type SnapEdge,
  type StageSize,
} from "./useWindowManager";

type AppLaunchSource = KernelEventPayloads["app.launch.requested"]["source"];

export function useDesktopWindowStage() {
  const hostRef = useTemplateRef<HTMLElement>("hostRef");
  const stageBounds = reactive({ width: 0, height: 0 });

  useResizeObserver(hostRef, (entries) => {
    const entry = entries[0];

    if (!entry) {
      return;
    }

    stageBounds.width = entry.contentRect.width;
    stageBounds.height = entry.contentRect.height;
  });

  // Stage offset is reactive on purpose — a future theme toggle / chrome change
  // (`ResizeObserver` + scroll), which never fire during a normal pointermove.
  const hostBounds = useElementBounding(hostRef);
  const stageOffset = computed(() => ({
    x: hostBounds.left.value,
    y: hostBounds.top.value,
  }));

  function measuredStageSize(): StageSize {
    if (stageBounds.width > 0 && stageBounds.height > 0) {
      return { width: stageBounds.width, height: stageBounds.height };
    }

    const rect = hostRef.value?.getBoundingClientRect();
    return {
      height: rect?.height ?? 0,
      width: rect?.width ?? 0,
    };
  }

  function maximizeStageSize(): StageSize {
    const stage = measuredStageSize();
    const host = hostRef.value;

    if (host === null || stage.width <= 0 || stage.height <= 0) {
      return stage;
    }

    if (!dockReveal.present || !dockReveal.occupiesStage) {
      return stage;
    }

    const dockRect = measureDockReveal();
    if (dockRect === null) {
      return stage;
    }

    const hostRect = host.getBoundingClientRect();
    const dockTop = dockRect.top - hostRect.top;

    if (dockRect.height <= 0 || dockTop <= 0 || dockTop >= stage.height) {
      return stage;
    }

    return {
      height: dockTop,
      width: stage.width,
    };
  }

  function stageForSnap(edge: SnapEdge): StageSize {
    return edge === "max" ? maximizeStageSize() : stageBounds;
  }

  function centeredInitialPosition(
    source: AppLaunchSource,
    size?: { width: number; height: number },
  ): { x: number; y: number } | undefined {
    if (source !== "deeplink") {
      return undefined;
    }

    const stage = measuredStageSize();
    if (stage.width <= 0 || stage.height <= 0) {
      return undefined;
    }

    const width = Math.max(size?.width ?? DEFAULT_W, MIN_W);
    const height = Math.max(size?.height ?? DEFAULT_H, MIN_H);

    return {
      x: Math.max(0, Math.floor((stage.width - width) / 2)),
      y: Math.max(0, Math.floor((stage.height - height) / 2)),
    };
  }

  return {
    centeredInitialPosition,
    hostRef,
    maximizeStageSize,
    measuredStageSize,
    stageBounds,
    stageForSnap,
    stageOffset,
  };
}
