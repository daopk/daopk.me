import {
  runHtmlInCanvasShardOverlay,
  type HtmlInCanvasShardOverlayRunnerOptions,
} from "../cinematics/shards";
import type { HtmlInCanvasCaptureSupport } from "../capture/captureSupport";

export type HtmlInCanvasTransitionPhase =
  | "idle"
  | "capturing"
  | "covering"
  | "cracking"
  | "floating"
  | "dropping"
  | "complete"
  | "error";

export interface HtmlInCanvasTransitionOrigin {
  readonly x: number;
  readonly y: number;
}

export interface HtmlInCanvasStartIntent {
  readonly origin: HtmlInCanvasTransitionOrigin;
}

export interface HtmlInCanvasSnapshot {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface HtmlInCanvasTransitionControllerState {
  readonly phase: HtmlInCanvasTransitionPhase;
  readonly busy: boolean;
  readonly error: string | null;
  readonly snapshotUrl: string | null;
}

export type HtmlInCanvasShardOverlayRunner = (
  snapshot: HtmlInCanvasSnapshot,
  revealDesktop: () => void | Promise<void>,
  options: HtmlInCanvasShardOverlayRunnerOptions,
) => Promise<void>;

export interface HtmlInCanvasTransitionControllerOptions {
  readonly reducedMotion: () => boolean;
  readonly detectSupport: () => HtmlInCanvasCaptureSupport;
  readonly captureSnapshot: () => Promise<HtmlInCanvasSnapshot>;
  readonly runShardOverlay?: HtmlInCanvasShardOverlayRunner;
  readonly documentRef: Document;
  readonly windowRef: Window;
  readonly waitForFrame: () => Promise<void>;
  readonly onStateChange?: (state: HtmlInCanvasTransitionControllerState) => void;
}

export class HtmlInCanvasTransitionController {
  private activeAbortController: AbortController | null = null;
  private error: string | null = null;
  private phase: HtmlInCanvasTransitionPhase = "idle";
  private runId = 0;
  private snapshotUrl: string | null = null;

  constructor(private readonly options: HtmlInCanvasTransitionControllerOptions) {}

  getState(): HtmlInCanvasTransitionControllerState {
    return {
      phase: this.phase,
      busy: isHtmlInCanvasTransitionBusy(this.phase),
      error: this.error,
      snapshotUrl: this.snapshotUrl,
    };
  }

  async start(
    revealDesktop: () => void | Promise<void>,
    intent: HtmlInCanvasStartIntent,
  ): Promise<void> {
    if (isHtmlInCanvasTransitionBusy(this.phase)) {
      return;
    }

    const currentRun = ++this.runId;
    const support = this.options.detectSupport();
    const abortController = new AbortController();

    this.activeAbortController = abortController;
    this.setState({ phase: "capturing", error: null, snapshotUrl: null });

    if (!support.supported) {
      this.activeAbortController = null;
      this.setState({
        phase: "error",
        error: `Screen transition unavailable: ${support.missingFeatures.join(", ")}.`,
      });
      return;
    }

    let snapshot: HtmlInCanvasSnapshot | null = null;

    try {
      snapshot = await this.options.captureSnapshot();
      if (currentRun !== this.runId) {
        return;
      }

      this.setState({ phase: "covering", snapshotUrl: snapshot.url });

      await (this.options.runShardOverlay ?? runHtmlInCanvasShardOverlay)(snapshot, revealDesktop, {
        reducedMotion: this.options.reducedMotion(),
        documentRef: this.options.documentRef,
        windowRef: this.options.windowRef,
        waitForFrame: this.options.waitForFrame,
        signal: abortController.signal,
        origin: intent.origin,
        setPhase: (nextPhase) => {
          if (currentRun === this.runId) {
            this.setState({ phase: nextPhase });
          }
        },
      });

      if (currentRun === this.runId) {
        this.setState({ phase: "complete" });
      }
    } catch (transitionError) {
      if (currentRun !== this.runId || abortController.signal.aborted) {
        return;
      }

      this.setState({
        phase: "error",
        error: toTransitionErrorMessage(transitionError),
      });
    } finally {
      if (snapshot !== null) {
        releaseSnapshotUrl(snapshot.url);
      }
      if (currentRun === this.runId) {
        this.setState({ snapshotUrl: null });
      }
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
    }
  }

  dispose(): void {
    this.runId++;
    this.activeAbortController?.abort();
    this.activeAbortController = null;
    this.setState({ phase: "idle", error: null, snapshotUrl: null });
  }

  private setState(
    state: Partial<Pick<HtmlInCanvasTransitionControllerState, "phase" | "error" | "snapshotUrl">>,
  ): void {
    if ("phase" in state && state.phase !== undefined) {
      this.phase = state.phase;
    }
    if ("error" in state) {
      this.error = state.error ?? null;
    }
    if ("snapshotUrl" in state) {
      this.snapshotUrl = state.snapshotUrl ?? null;
    }
    this.options.onStateChange?.(this.getState());
  }
}

export function isHtmlInCanvasTransitionBusy(phase: HtmlInCanvasTransitionPhase): boolean {
  return phase !== "idle" && phase !== "complete" && phase !== "error";
}

function releaseSnapshotUrl(url: string): void {
  if (!url.startsWith("blob:")) {
    return;
  }

  if (typeof globalThis.URL.revokeObjectURL === "function") {
    globalThis.URL.revokeObjectURL(url);
  }
}

function toTransitionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to run the Breaking Glass transition.";
}
