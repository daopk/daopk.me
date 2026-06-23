import { ref, type Ref } from "vue";

type FullscreenMethod = () => Promise<void> | void;

interface WebKitFullscreenDocument extends Document {
  readonly webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: FullscreenMethod;
}

interface WebKitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: FullscreenMethod;
}

interface WebKitFullscreenVideoElement extends HTMLVideoElement {
  readonly webkitDisplayingFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
}

interface UseMoviePlayerFullscreenOptions {
  readonly playerShell: Readonly<Ref<HTMLElement | null>>;
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
  readonly showControls: (options?: { readonly force?: boolean }) => void;
}

export interface UseMoviePlayerFullscreenBindings {
  readonly fallbackFullscreen: Ref<boolean>;
  readonly fullscreen: Ref<boolean>;
  exitFallbackFullscreen(): void;
  syncFullscreenState(): void;
  toggleFullscreen(): Promise<void>;
}

export function useMoviePlayerFullscreen({
  playerShell,
  videoElement,
  showControls,
}: UseMoviePlayerFullscreenOptions): UseMoviePlayerFullscreenBindings {
  const fullscreen = ref(false);
  const fallbackFullscreen = ref(false);

  function fullscreenDocument(): WebKitFullscreenDocument | null {
    return typeof document === "undefined" ? null : (document as WebKitFullscreenDocument);
  }

  function documentFullscreenElement(): Element | null {
    const currentDocument = fullscreenDocument();
    if (currentDocument === null) {
      return null;
    }

    return currentDocument.fullscreenElement ?? currentDocument.webkitFullscreenElement ?? null;
  }

  function webKitVideoElement(): WebKitFullscreenVideoElement | null {
    return videoElement.value as WebKitFullscreenVideoElement | null;
  }

  function isNativeVideoFullscreen(
    video: WebKitFullscreenVideoElement | null = webKitVideoElement(),
  ): boolean {
    return Boolean(video?.webkitDisplayingFullscreen);
  }

  function syncFullscreenState(): void {
    const element = playerShell.value;

    fullscreen.value =
      element !== null &&
      (fallbackFullscreen.value ||
        documentFullscreenElement() === element ||
        isNativeVideoFullscreen(webKitVideoElement()));
  }

  async function requestDocumentFullscreen(element: HTMLElement): Promise<boolean> {
    const webKitElement = element as WebKitFullscreenElement;

    if (typeof element.requestFullscreen === "function") {
      try {
        await element.requestFullscreen();
        return true;
      } catch {
        // Fall through to Safari's prefixed API or native video fullscreen.
      }
    }

    if (typeof webKitElement.webkitRequestFullscreen === "function") {
      try {
        await webKitElement.webkitRequestFullscreen();
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  async function exitDocumentFullscreen(): Promise<boolean> {
    const currentDocument = fullscreenDocument();
    if (currentDocument === null) {
      return false;
    }

    if (typeof currentDocument.exitFullscreen === "function") {
      try {
        await currentDocument.exitFullscreen();
        return true;
      } catch {
        // Fall through to Safari's prefixed API.
      }
    }

    if (typeof currentDocument.webkitExitFullscreen === "function") {
      try {
        await currentDocument.webkitExitFullscreen();
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  function enterNativeVideoFullscreen(video: WebKitFullscreenVideoElement | null): boolean {
    if (typeof video?.webkitEnterFullscreen !== "function") {
      return false;
    }

    try {
      video.webkitEnterFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  function exitNativeVideoFullscreen(video: WebKitFullscreenVideoElement | null): boolean {
    if (typeof video?.webkitExitFullscreen !== "function") {
      return false;
    }

    try {
      video.webkitExitFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  function enterFallbackFullscreen(): void {
    fallbackFullscreen.value = true;
    fullscreen.value = true;
    showControls({ force: true });
  }

  function exitFallbackFullscreen(): void {
    fallbackFullscreen.value = false;
    syncFullscreenState();
  }

  async function toggleFullscreen(): Promise<void> {
    const element = playerShell.value;
    if (element === null || typeof document === "undefined") {
      return;
    }

    const video = webKitVideoElement();

    if (fallbackFullscreen.value) {
      exitFallbackFullscreen();
      return;
    }

    if (documentFullscreenElement() === element) {
      await exitDocumentFullscreen();
      syncFullscreenState();
      return;
    }

    if (isNativeVideoFullscreen(video)) {
      exitNativeVideoFullscreen(video);
      syncFullscreenState();
      return;
    }

    if (!(await requestDocumentFullscreen(element))) {
      const enteredVideoFullscreen = enterNativeVideoFullscreen(video);
      if (!enteredVideoFullscreen) {
        enterFallbackFullscreen();
        return;
      }
    }
    syncFullscreenState();
  }

  return {
    fallbackFullscreen,
    fullscreen,
    exitFallbackFullscreen,
    syncFullscreenState,
    toggleFullscreen,
  };
}
