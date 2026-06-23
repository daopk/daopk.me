import { ref, type Ref } from "vue";

type WebKitPresentationMode = "fullscreen" | "inline" | "picture-in-picture";

interface WebKitVideoElement extends HTMLVideoElement {
  readonly webkitPresentationMode?: WebKitPresentationMode;
  webkitSetPresentationMode?: (mode: WebKitPresentationMode) => void;
  webkitSupportsPresentationMode?: (mode: WebKitPresentationMode) => boolean;
}

interface StandaloneNavigator extends Navigator {
  readonly standalone?: boolean;
}

interface UseMoviePictureInPictureOptions {
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
  readonly showControls: (options?: { readonly force?: boolean }) => void;
}

export interface UseMoviePictureInPictureBindings {
  readonly pictureInPicture: Ref<boolean>;
  readonly pictureInPictureSupported: Ref<boolean>;
  syncPictureInPictureState(): void;
  togglePictureInPicture(): Promise<void>;
}

export function isAppleTouchPlatform(navigatorLike: Navigator | null): boolean {
  if (navigatorLike === null) {
    return false;
  }

  return (
    /iPad|iPhone|iPod/.test(navigatorLike.userAgent) ||
    (navigatorLike.platform === "MacIntel" && navigatorLike.maxTouchPoints > 1)
  );
}

export function useMoviePictureInPicture({
  videoElement,
  showControls,
}: UseMoviePictureInPictureOptions): UseMoviePictureInPictureBindings {
  const pictureInPicture = ref(false);
  const pictureInPictureSupported = ref(false);

  function pictureInPictureDocument(): Document | null {
    return typeof document === "undefined" ? null : document;
  }

  function pictureInPictureVideoElement(): WebKitVideoElement | null {
    return videoElement.value as WebKitVideoElement | null;
  }

  function standaloneNavigator(): StandaloneNavigator | null {
    return typeof navigator === "undefined" ? null : (navigator as StandaloneNavigator);
  }

  function isStandaloneDisplayMode(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches
    );
  }

  function isIosStandaloneWebApp(): boolean {
    const navigatorLike = standaloneNavigator();
    return (
      navigatorLike?.standalone === true ||
      (isAppleTouchPlatform(navigatorLike) && isStandaloneDisplayMode())
    );
  }

  function canUseStandardPictureInPicture(
    video: WebKitVideoElement | null = pictureInPictureVideoElement(),
  ): boolean {
    const currentDocument = pictureInPictureDocument();
    return Boolean(
      currentDocument?.pictureInPictureEnabled &&
      typeof video?.requestPictureInPicture === "function" &&
      !video.disablePictureInPicture,
    );
  }

  function canUseWebKitPictureInPicture(
    video: WebKitVideoElement | null = pictureInPictureVideoElement(),
  ): boolean {
    if (
      video === null ||
      video.disablePictureInPicture ||
      typeof video.webkitSetPresentationMode !== "function" ||
      typeof video.webkitSupportsPresentationMode !== "function"
    ) {
      return false;
    }

    try {
      return video.webkitSupportsPresentationMode("picture-in-picture");
    } catch {
      return false;
    }
  }

  function canUsePictureInPicture(
    video: WebKitVideoElement | null = pictureInPictureVideoElement(),
  ): boolean {
    if (isIosStandaloneWebApp()) {
      return false;
    }

    return canUseStandardPictureInPicture(video) || canUseWebKitPictureInPicture(video);
  }

  function isStandardPictureInPicture(video: WebKitVideoElement | null): boolean {
    const currentDocument = pictureInPictureDocument();
    return video !== null && currentDocument?.pictureInPictureElement === video;
  }

  function isWebKitPictureInPicture(video: WebKitVideoElement | null): boolean {
    return video?.webkitPresentationMode === "picture-in-picture";
  }

  function syncPictureInPictureState(): void {
    const video = pictureInPictureVideoElement();
    pictureInPictureSupported.value = canUsePictureInPicture(video);
    pictureInPicture.value = isStandardPictureInPicture(video) || isWebKitPictureInPicture(video);
  }

  function setWebKitPictureInPicture(video: WebKitVideoElement, enabled: boolean): boolean {
    if (!canUseWebKitPictureInPicture(video)) {
      return false;
    }

    try {
      video.webkitSetPresentationMode?.(enabled ? "picture-in-picture" : "inline");
      return true;
    } catch {
      return false;
    }
  }

  async function togglePictureInPicture(): Promise<void> {
    const currentDocument = pictureInPictureDocument();
    const video = pictureInPictureVideoElement();
    if (currentDocument === null || video === null || !canUsePictureInPicture(video)) {
      syncPictureInPictureState();
      return;
    }

    try {
      if (isStandardPictureInPicture(video)) {
        await currentDocument.exitPictureInPicture?.();
        syncPictureInPictureState();
        return;
      }

      if (isWebKitPictureInPicture(video)) {
        setWebKitPictureInPicture(video, false);
        syncPictureInPictureState();
        return;
      }

      if (currentDocument.pictureInPictureElement != null) {
        await currentDocument.exitPictureInPicture?.();
      }

      if (canUseStandardPictureInPicture(video)) {
        await video.requestPictureInPicture?.();
      } else {
        setWebKitPictureInPicture(video, true);
      }

      syncPictureInPictureState();
      showControls({ force: true });
    } catch {
      syncPictureInPictureState();
    }
  }

  return {
    pictureInPicture,
    pictureInPictureSupported,
    syncPictureInPictureState,
    togglePictureInPicture,
  };
}
