import type { Ref } from "vue";

type ShowControls = (eventOrOptions?: Event | { readonly force?: boolean }) => void;

interface UseMoviePlayerSurfaceOptions {
  readonly backControlsRoot: Readonly<Ref<HTMLElement | null>>;
  readonly controlsFocused: Ref<boolean>;
  readonly controlsRoot: Readonly<Ref<HTMLElement | null>>;
  readonly scheduleAutoHideControls: () => void;
  readonly showControls: ShowControls;
  readonly toggleFullscreen: () => Promise<void>;
  readonly togglePlayback: () => void;
  readonly topbarControlsRoot: Readonly<Ref<HTMLElement | null>>;
}

export interface UseMoviePlayerSurfaceBindings {
  clearSurfaceClickTimer(): void;
  onCenterPlayClick(event: MouseEvent): void;
  onCenterPlayDoubleClick(event: MouseEvent): void;
  onControlsFocusOut(event: FocusEvent): void;
  onPlayerSurfaceClick(event: MouseEvent): void;
  onPlayerSurfaceDoubleClick(event: MouseEvent): void;
  playerControlsContain(target: EventTarget | null): boolean;
}

const SURFACE_CLICK_DELAY_MS = 220;

export function useMoviePlayerSurface({
  backControlsRoot,
  controlsFocused,
  controlsRoot,
  scheduleAutoHideControls,
  showControls,
  toggleFullscreen,
  togglePlayback,
  topbarControlsRoot,
}: UseMoviePlayerSurfaceOptions): UseMoviePlayerSurfaceBindings {
  let surfaceClickTimer: number | undefined;

  function clearSurfaceClickTimer(): void {
    if (surfaceClickTimer === undefined || typeof window === "undefined") {
      return;
    }

    window.clearTimeout(surfaceClickTimer);
    surfaceClickTimer = undefined;
  }

  function queueSurfacePlaybackToggle(): void {
    clearSurfaceClickTimer();

    if (typeof window === "undefined") {
      togglePlayback();
      return;
    }

    surfaceClickTimer = window.setTimeout(() => {
      surfaceClickTimer = undefined;
      togglePlayback();
    }, SURFACE_CLICK_DELAY_MS);
  }

  function isPrimaryClick(event: MouseEvent): boolean {
    return (
      event.button === 0 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    );
  }

  function isSettingsMenuTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) {
      return false;
    }

    const element = target instanceof Element ? target : target.parentElement;
    return (element?.closest(".movies-hls-player__settings-menu") ?? null) !== null;
  }

  function playerControlsContain(target: EventTarget | null): boolean {
    return (
      target instanceof Node &&
      (controlsRoot.value?.contains(target) === true ||
        topbarControlsRoot.value?.contains(target) === true ||
        backControlsRoot.value?.contains(target) === true ||
        isSettingsMenuTarget(target))
    );
  }

  function playerEventPathContainsControls(event: MouseEvent): boolean {
    return event.composedPath().some((target) => playerControlsContain(target));
  }

  function isSurfaceClickTarget(event: MouseEvent): boolean {
    const target = event.target;
    if (!(target instanceof Node)) {
      return false;
    }

    if (playerControlsContain(target) || playerEventPathContainsControls(event)) {
      return false;
    }

    return true;
  }

  function onPlayerSurfaceClick(event: MouseEvent): void {
    if (event.defaultPrevented || !isPrimaryClick(event) || !isSurfaceClickTarget(event)) {
      return;
    }

    if (event.detail > 1) {
      clearSurfaceClickTimer();
      return;
    }

    queueSurfacePlaybackToggle();
  }

  function onPlayerSurfaceDoubleClick(event: MouseEvent): void {
    if (event.defaultPrevented || !isPrimaryClick(event) || !isSurfaceClickTarget(event)) {
      return;
    }

    event.preventDefault();
    clearSurfaceClickTimer();
    showControls({ force: true });
    void toggleFullscreen();
  }

  function onCenterPlayClick(event: MouseEvent): void {
    event.stopPropagation();
    if (event.defaultPrevented || !isPrimaryClick(event)) {
      return;
    }

    if (event.detail > 1) {
      clearSurfaceClickTimer();
      return;
    }

    queueSurfacePlaybackToggle();
  }

  function onCenterPlayDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    clearSurfaceClickTimer();
    showControls({ force: true });
    void toggleFullscreen();
  }

  function onControlsFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;
    if (!playerControlsContain(nextTarget)) {
      controlsFocused.value = false;
      scheduleAutoHideControls();
    }
  }

  return {
    clearSurfaceClickTimer,
    onCenterPlayClick,
    onCenterPlayDoubleClick,
    onControlsFocusOut,
    onPlayerSurfaceClick,
    onPlayerSurfaceDoubleClick,
    playerControlsContain,
  };
}
