import {
  computed,
  inject,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";

import { KernelInjectionKey } from "@daopk/sdk";

import type { MovieSummary, MovieTrailerResult } from "../moviesApi";
import type { ShellId } from "~/types/shell";

const TRAILER_PREVIEW_CLOSE_DELAY_MS = 120;
const TRAILER_PREVIEW_POINTER_CLOSE_DELAY_MS = 360;
const TRAILER_PREVIEW_OPEN_DELAY_MS = 2_000;
const TRAILER_PREVIEW_SWITCH_DELAY_MS = 80;

export type MovieTrailerPreviewAnchorMode = "center" | "element";
export type MovieTrailerPreviewReference =
  | Element
  | {
      contextElement?: Element;
      getBoundingClientRect: () => DOMRect;
    };

export interface UseMovieTrailerPreviewBindings {
  readonly anchorMode: Ref<MovieTrailerPreviewAnchorMode>;
  readonly enabled: ComputedRef<boolean>;
  readonly movie: Ref<MovieSummary | null>;
  readonly reference: ShallowRef<MovieTrailerPreviewReference | undefined>;
  readonly trailerCache: Map<string, Promise<MovieTrailerResult>>;
  close(event?: Event): void;
  closeNow(): void;
  keepOpen(): void;
  move(movie: MovieSummary, event: PointerEvent): void;
  showFromFocus(movie: MovieSummary, event: FocusEvent): void;
  showFromPointer(movie: MovieSummary, event: PointerEvent): void;
}

export function useMovieTrailerPreview(): UseMovieTrailerPreviewBindings {
  const kernel = inject(KernelInjectionKey, null);
  const activeShellId = ref<ShellId>(detectActiveShell());
  const anchorMode = ref<MovieTrailerPreviewAnchorMode>("element");
  const hoverCapable = ref(detectTrailerPreviewCapability());
  const movie = ref<MovieSummary | null>(null);
  const reference = shallowRef<MovieTrailerPreviewReference | undefined>();
  const trailerCache = new Map<string, Promise<MovieTrailerResult>>();

  let activeTriggerElement: Element | null = null;
  let closeTimer: number | undefined;
  let lastPointerPoint: { readonly x: number; readonly y: number } | null = null;
  let openTimer: number | undefined;
  let pendingAnchorMode: MovieTrailerPreviewAnchorMode = "center";
  let pendingMovieId: string | null = null;
  let pendingReference: MovieTrailerPreviewReference | undefined;
  let stopShellChangedListener: (() => void) | undefined;

  const enabled = computed(() => activeShellId.value === "desktop" && hoverCapable.value);

  watch(enabled, (nextEnabled) => {
    if (!nextEnabled) {
      closeNow();
    }
  });

  onMounted(() => {
    refreshEnvironment();
    stopShellChangedListener = kernel?.events.on?.("shell.changed", (payload) => {
      activeShellId.value = payload.shellId;
    });
    if (typeof window !== "undefined") {
      window.addEventListener("resize", refreshEnvironment);
    }
  });

  onUnmounted(() => {
    clearTimers();
    stopShellChangedListener?.();
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", refreshEnvironment);
    }
  });

  function clearTimers(): void {
    clearOpenTimer();
    if (closeTimer !== undefined) {
      window.clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  }

  function clearOpenTimer(): void {
    if (openTimer !== undefined) {
      window.clearTimeout(openTimer);
      openTimer = undefined;
    }
    pendingMovieId = null;
    pendingReference = undefined;
    pendingAnchorMode = "center";
  }

  function refreshEnvironment(): void {
    activeShellId.value = detectActiveShell();
    hoverCapable.value = detectTrailerPreviewCapability();
    if (!enabled.value) {
      closeNow();
    }
  }

  function activate(
    nextMovie: MovieSummary,
    nextReference: MovieTrailerPreviewReference,
    nextAnchorMode: MovieTrailerPreviewAnchorMode,
  ): void {
    movie.value = nextMovie;
    reference.value = nextReference;
    anchorMode.value = nextAnchorMode;
  }

  function setPendingReference(
    nextMovie: MovieSummary,
    nextReference: MovieTrailerPreviewReference,
    nextAnchorMode: MovieTrailerPreviewAnchorMode,
  ): void {
    pendingMovieId = nextMovie.id;
    pendingReference = nextReference;
    pendingAnchorMode = nextAnchorMode;
  }

  function showFromPointer(nextMovie: MovieSummary, event: PointerEvent): void {
    if (event.pointerType !== "mouse" || !enabled.value) {
      return;
    }

    trackPointer(event);
    const nextReference = referenceFromTarget(event);
    if (nextReference === undefined) {
      return;
    }

    if (closeTimer !== undefined) {
      window.clearTimeout(closeTimer);
      closeTimer = undefined;
    }

    if (movie.value?.id === nextMovie.id) {
      clearOpenTimer();
      return;
    }

    if (pendingMovieId === nextMovie.id) {
      setPendingReference(nextMovie, nextReference, "center");
      return;
    }

    clearOpenTimer();
    setPendingReference(nextMovie, nextReference, "center");
    openTimer = window.setTimeout(
      () => {
        if (pendingMovieId === nextMovie.id && pendingReference !== undefined) {
          activate(nextMovie, pendingReference, pendingAnchorMode);
        }
        openTimer = undefined;
        pendingMovieId = null;
        pendingReference = undefined;
        pendingAnchorMode = "center";
      },
      movie.value === null ? TRAILER_PREVIEW_OPEN_DELAY_MS : TRAILER_PREVIEW_SWITCH_DELAY_MS,
    );
  }

  function move(nextMovie: MovieSummary, event: PointerEvent): void {
    if (event.pointerType !== "mouse" || !enabled.value) {
      return;
    }

    trackPointer(event);
    if (pendingMovieId === nextMovie.id) {
      const nextReference = referenceFromTarget(event);
      if (nextReference !== undefined) {
        setPendingReference(nextMovie, nextReference, "center");
      }
      return;
    }

    if (movie.value?.id !== nextMovie.id) {
      showFromPointer(nextMovie, event);
    }
  }

  function showFromFocus(nextMovie: MovieSummary, event: FocusEvent): void {
    if (!enabled.value) {
      return;
    }

    const nextReference = referenceFromTarget(event);
    if (nextReference === undefined) {
      return;
    }

    if (closeTimer !== undefined) {
      window.clearTimeout(closeTimer);
      closeTimer = undefined;
    }
    activeTriggerElement = isElement(nextReference) ? nextReference : null;
    clearOpenTimer();
    activate(nextMovie, nextReference, "element");
  }

  function close(event?: Event): void {
    clearOpenTimer();
    const shouldRecheckPointer = isMousePointerEvent(event);
    if (shouldRecheckPointer) {
      trackPointer(event);
    }

    if (closeTimer !== undefined) {
      window.clearTimeout(closeTimer);
    }
    closeTimer = window.setTimeout(
      () => {
        if (shouldRecheckPointer && isPointerStillOverPreviewArea()) {
          closeTimer = undefined;
          return;
        }

        closeNow();
        closeTimer = undefined;
      },
      shouldRecheckPointer
        ? TRAILER_PREVIEW_POINTER_CLOSE_DELAY_MS
        : TRAILER_PREVIEW_CLOSE_DELAY_MS,
    );
  }

  function keepOpen(): void {
    if (closeTimer !== undefined) {
      window.clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  }

  function closeNow(): void {
    clearTimers();
    activeTriggerElement = null;
    lastPointerPoint = null;
    movie.value = null;
    reference.value = undefined;
  }

  function trackPointer(event: PointerEvent): void {
    lastPointerPoint = { x: event.clientX, y: event.clientY };
    const nextTriggerElement = referenceFromTarget(event);
    if (isElement(nextTriggerElement) && !isTrailerPreviewElement(nextTriggerElement)) {
      activeTriggerElement = nextTriggerElement;
    }
  }

  function isPointerStillOverPreviewArea(): boolean {
    if (
      lastPointerPoint === null ||
      typeof document === "undefined" ||
      typeof document.elementFromPoint !== "function"
    ) {
      return false;
    }

    const target = document.elementFromPoint(lastPointerPoint.x, lastPointerPoint.y);
    if (target === null) {
      return false;
    }

    return (
      (activeTriggerElement !== null && activeTriggerElement.contains(target)) ||
      target.closest(".movies-trailer-hover-card") !== null
    );
  }

  return {
    anchorMode,
    enabled,
    movie,
    reference,
    trailerCache,
    close,
    closeNow,
    keepOpen,
    move,
    showFromFocus,
    showFromPointer,
  };
}

function isMousePointerEvent(event: Event | undefined): event is PointerEvent {
  return (
    event !== undefined &&
    "pointerType" in event &&
    (event as PointerEvent).pointerType === "mouse" &&
    "clientX" in event &&
    "clientY" in event
  );
}

function isElement(value: unknown): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

function isTrailerPreviewElement(element: Element): boolean {
  return element.closest(".movies-trailer-hover-card") !== null;
}

function detectActiveShell(): ShellId {
  if (typeof document === "undefined") {
    return "desktop";
  }

  const shellId = document.documentElement.dataset.shell;
  return shellId === "mobile" || shellId === "desktop" ? shellId : "desktop";
}

function detectTrailerPreviewCapability(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }

  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function referenceFromTarget(event: Event): MovieTrailerPreviewReference | undefined {
  const target = event.currentTarget;
  if (
    target !== null &&
    typeof target === "object" &&
    "getBoundingClientRect" in target &&
    typeof target.getBoundingClientRect === "function"
  ) {
    return target as Element;
  }

  return undefined;
}
