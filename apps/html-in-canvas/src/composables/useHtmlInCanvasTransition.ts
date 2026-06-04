import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";

import { captureDesktopSnapshot } from "../engine/capture/desktopSnapshot";
import {
  detectHtmlInCanvasCaptureSupport,
  type HtmlInCanvasCaptureSupport,
} from "../engine/capture/captureSupport";
import {
  HtmlInCanvasTransitionController,
  isHtmlInCanvasTransitionBusy,
  type HtmlInCanvasShardOverlayRunner,
  type HtmlInCanvasSnapshot,
  type HtmlInCanvasStartIntent,
  type HtmlInCanvasTransitionOrigin,
  type HtmlInCanvasTransitionPhase,
} from "../engine/transition/transitionController";

export type {
  HtmlInCanvasShardOverlayRunner,
  HtmlInCanvasSnapshot,
  HtmlInCanvasStartIntent,
  HtmlInCanvasTransitionOrigin,
  HtmlInCanvasTransitionPhase,
};
export { captureDesktopSnapshot };

export interface HtmlInCanvasTransition {
  readonly phase: Readonly<Ref<HtmlInCanvasTransitionPhase>>;
  readonly busy: ComputedRef<boolean>;
  readonly error: Readonly<Ref<string | null>>;
  readonly snapshotUrl: Readonly<Ref<string | null>>;
  start(revealDesktop: () => void | Promise<void>, intent: HtmlInCanvasStartIntent): Promise<void>;
  dispose(): void;
}

interface UseHtmlInCanvasTransitionOptions {
  readonly reducedMotion?: MaybeRefOrGetter<boolean>;
  readonly detectSupport?: () => HtmlInCanvasCaptureSupport;
  readonly captureSnapshot?: () => Promise<HtmlInCanvasSnapshot>;
  readonly runShardOverlay?: HtmlInCanvasShardOverlayRunner;
  readonly documentRef?: Document;
  readonly windowRef?: Window;
  readonly waitForFrame?: () => Promise<void>;
}

export function useHtmlInCanvasTransition({
  reducedMotion = false,
  detectSupport = detectHtmlInCanvasCaptureSupport,
  captureSnapshot,
  runShardOverlay,
  documentRef = document,
  windowRef = window,
  waitForFrame = () => nextAnimationFrame(windowRef),
}: UseHtmlInCanvasTransitionOptions = {}): HtmlInCanvasTransition {
  const phase = ref<HtmlInCanvasTransitionPhase>("idle");
  const error = ref<string | null>(null);
  const snapshotUrl = ref<string | null>(null);
  const busy = computed(() => isHtmlInCanvasTransitionBusy(phase.value));
  const transitionController = new HtmlInCanvasTransitionController({
    reducedMotion: () => toValue(reducedMotion),
    detectSupport,
    captureSnapshot:
      captureSnapshot ?? (() => captureDesktopSnapshot({ documentRef, windowRef, waitForFrame })),
    runShardOverlay,
    documentRef,
    windowRef,
    waitForFrame,
    onStateChange(state) {
      phase.value = state.phase;
      error.value = state.error;
      snapshotUrl.value = state.snapshotUrl;
    },
  });

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => transitionController.dispose());
  }

  return {
    phase,
    busy,
    error,
    snapshotUrl,
    start: (revealDesktop, intent) => transitionController.start(revealDesktop, intent),
    dispose: () => transitionController.dispose(),
  };
}

function nextAnimationFrame(windowRef: Window): Promise<void> {
  return new Promise((resolve) => {
    windowRef.requestAnimationFrame(() => resolve());
  });
}
