import { ref, type Ref } from "vue";

import { useGesture, type GestureSnapshot, type UseGestureReturn } from "~/composables/useGesture";

export type EdgeSwipeEdge = "left" | "right" | "top" | "bottom";

export interface UseEdgeSwipeOptions {
  edge: EdgeSwipeEdge;
  edgeThreshold?: number;
  distanceThreshold?: number;
  velocityThreshold?: number;
  acceptMouse?: boolean;
  onSwipe: () => void;
  onProgress?: (progress: number) => void;
}

export interface UseEdgeSwipeReturn extends UseGestureReturn {
  readonly lastOutcome: Ref<"recognized" | "abandoned" | "cancelled" | null>;
}

function axisDelta(edge: EdgeSwipeEdge, snapshot: GestureSnapshot): number {
  switch (edge) {
    case "left":
      return snapshot.deltaX;
    case "right":
      return -snapshot.deltaX;
    case "top":
      return snapshot.deltaY;
    case "bottom":
      return -snapshot.deltaY;
  }
}

function startsAtEdge(
  edge: EdgeSwipeEdge,
  snapshot: GestureSnapshot,
  edgeThreshold: number,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  // Prefer `visualViewport` dimensions where supported. iOS Safari drifts the
  const vvWidth = window.visualViewport?.width ?? window.innerWidth;
  const vvHeight = window.visualViewport?.height ?? window.innerHeight;

  switch (edge) {
    case "left":
      return snapshot.startX <= edgeThreshold;
    case "right":
      return snapshot.startX >= vvWidth - edgeThreshold;
    case "top":
      return snapshot.startY <= edgeThreshold;
    case "bottom":
      return snapshot.startY >= vvHeight - edgeThreshold;
  }
}

export function useEdgeSwipe(
  target: Ref<HTMLElement | null | undefined>,
  options: UseEdgeSwipeOptions,
): UseEdgeSwipeReturn {
  const edgeThreshold = options.edgeThreshold ?? 24;
  const distanceThreshold = options.distanceThreshold ?? 80;
  const velocityThreshold = options.velocityThreshold ?? 0.3;

  const lastOutcome = ref<"recognized" | "abandoned" | "cancelled" | null>(null);

  function resetProgress(): void {
    options.onProgress?.(0);
  }

  const gesture = useGesture(target, {
    acceptMouse: options.acceptMouse ?? false,
    onStart(snapshot) {
      if (!startsAtEdge(options.edge, snapshot, edgeThreshold)) {
        return false;
      }
      lastOutcome.value = null;
    },
    onMove(snapshot) {
      if (!options.onProgress) {
        return;
      }
      const raw = axisDelta(options.edge, snapshot) / distanceThreshold;
      const clamped = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0));
      options.onProgress(clamped);
    },
    onEnd(snapshot) {
      const travel = axisDelta(options.edge, snapshot);
      const elapsed = snapshot.at - snapshot.startedAt;
      const velocity = elapsed > 0 ? travel / elapsed : 0;

      const recognized = travel >= distanceThreshold || velocity >= velocityThreshold;

      if (recognized) {
        lastOutcome.value = "recognized";
        options.onSwipe();
      } else {
        lastOutcome.value = "abandoned";
        resetProgress();
      }
    },
    onCancel() {
      lastOutcome.value = "cancelled";
      resetProgress();
    },
  });

  return {
    ...gesture,
    lastOutcome,
  };
}
