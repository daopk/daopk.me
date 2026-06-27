import { onBeforeUnmount, onMounted, watch, type ComputedRef, type Ref } from "vue";

import type { MoviePlayInfo } from "../moviesApi";
import { normalizedMoviePlaybackSpeed as normalizedPlaybackSpeed } from "./useMoviePlaybackState";

interface MoviePlayerLifecycleProps {
  readonly autoplay: boolean;
  readonly play: MoviePlayInfo;
  readonly playbackSpeed: number;
}

interface UseMoviePlayerLifecycleOptions {
  readonly activeSource: ComputedRef<MoviePlayInfo["sources"][number] | null>;
  readonly applyPlaybackSpeed: (video: HTMLVideoElement | null) => void;
  readonly attachSource: (options?: { readonly autoplay: boolean }) => Promise<void>;
  readonly clearHideControlsTimer: () => void;
  readonly clearSurfaceClickTimer: () => void;
  readonly currentTime: Ref<number>;
  readonly destroyHls: () => void;
  readonly disposePlaybackProgress: () => void;
  readonly metadataLoaded: Ref<boolean>;
  readonly persistPlaybackProgress: (options?: { readonly force?: boolean }) => void;
  readonly playVideo: () => Promise<void>;
  readonly playbackSpeed: Ref<number>;
  readonly playing: Ref<boolean>;
  readonly props: Readonly<MoviePlayerLifecycleProps>;
  readonly syncFullscreenState: () => void;
  readonly syncPictureInPictureState: () => void;
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
}

export function useMoviePlayerLifecycle({
  activeSource,
  applyPlaybackSpeed,
  attachSource,
  clearHideControlsTimer,
  clearSurfaceClickTimer,
  currentTime,
  destroyHls,
  disposePlaybackProgress,
  metadataLoaded,
  persistPlaybackProgress,
  playVideo,
  playbackSpeed,
  playing,
  props,
  syncFullscreenState,
  syncPictureInPictureState,
  videoElement,
}: UseMoviePlayerLifecycleOptions): void {
  let previousSourcesRef: MoviePlayInfo["sources"] | null = null;

  onMounted(() => {
    syncFullscreenState();
    syncPictureInPictureState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    videoElement.value?.addEventListener("webkitbeginfullscreen", syncFullscreenState);
    videoElement.value?.addEventListener("webkitendfullscreen", syncFullscreenState);
    videoElement.value?.addEventListener("enterpictureinpicture", syncPictureInPictureState);
    videoElement.value?.addEventListener("leavepictureinpicture", syncPictureInPictureState);
    videoElement.value?.addEventListener(
      "webkitpresentationmodechanged",
      syncPictureInPictureState,
    );
    previousSourcesRef = props.play.sources;
    void attachSource({ autoplay: props.autoplay });
  });

  watch(
    () => activeSource.value?.m3u8Url ?? "",
    () => {
      const sources = props.play.sources;
      const isSourceSwitch = previousSourcesRef !== null && previousSourcesRef === sources;
      previousSourcesRef = sources;
      void attachSource({ autoplay: isSourceSwitch || props.autoplay });
    },
  );

  watch(
    () => props.autoplay,
    (autoplay) => {
      if (autoplay && metadataLoaded.value && !playing.value && currentTime.value === 0) {
        void playVideo();
      }
    },
  );

  watch(
    () => props.playbackSpeed,
    (nextSpeed) => {
      const speed = normalizedPlaybackSpeed(nextSpeed);
      if (playbackSpeed.value === speed) {
        applyPlaybackSpeed(videoElement.value);
        return;
      }

      playbackSpeed.value = speed;
      applyPlaybackSpeed(videoElement.value);
    },
  );

  onBeforeUnmount(() => {
    persistPlaybackProgress({ force: true });
    clearHideControlsTimer();
    clearSurfaceClickTimer();
    destroyHls();
    disposePlaybackProgress();
    document.removeEventListener("fullscreenchange", syncFullscreenState);
    document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    videoElement.value?.removeEventListener("webkitbeginfullscreen", syncFullscreenState);
    videoElement.value?.removeEventListener("webkitendfullscreen", syncFullscreenState);
    videoElement.value?.removeEventListener("enterpictureinpicture", syncPictureInPictureState);
    videoElement.value?.removeEventListener("leavepictureinpicture", syncPictureInPictureState);
    videoElement.value?.removeEventListener(
      "webkitpresentationmodechanged",
      syncPictureInPictureState,
    );
  });
}
