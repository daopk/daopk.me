import Hls, { type ErrorData, type ManifestParsedData } from "hls.js";
import { computed, nextTick, ref, type ComputedRef, type Ref } from "vue";

import { createMoviesHlsConfig, type HlsPlaybackAdMarker } from "../hls/hlsAdSkip";
import type { MoviesTranslationKey } from "../i18n";
import type { MoviePlayInfo } from "../moviesApi";

export interface MovieQualityOption {
  readonly label: string;
  readonly value: number;
}

export interface MovieHlsQualityLevel {
  readonly bitrate: number;
  readonly height: number;
}

export type MoviePlaybackErrorKey = Extract<
  MoviesTranslationKey,
  | "movies.player.error.startFailed"
  | "movies.player.error.streamFailed"
  | "movies.player.error.unsupported"
>;

interface UseMovieHlsSourceOptions {
  readonly play: Readonly<Ref<MoviePlayInfo>>;
  readonly sourceIndex: Readonly<Ref<number>>;
  readonly videoElement: Readonly<Ref<HTMLVideoElement | null>>;
  readonly applyPlaybackSpeed: (video: HTMLVideoElement | null) => void;
  readonly onFatalError: () => void;
  readonly onQualityChanged: () => void;
  readonly persistPlaybackProgress: (options?: { readonly force?: boolean }) => void;
  readonly qualityFallbackLabel: (index: number) => string;
  readonly requestAutoplayOnce: () => void;
  readonly resetPlaybackState: () => void;
  readonly setPlaybackError: (key: MoviePlaybackErrorKey) => void;
}

export interface UseMovieHlsSourceBindings {
  readonly activeSource: ComputedRef<MoviePlayInfo["sources"][number] | null>;
  readonly currentLevel: Ref<number>;
  readonly hlsLevels: Ref<readonly MovieHlsQualityLevel[]>;
  readonly playbackAdMarkers: Ref<readonly HlsPlaybackAdMarker[]>;
  readonly qualityOptions: ComputedRef<readonly MovieQualityOption[]>;
  readonly selectedQualityLevel: Ref<number>;
  readonly selectedSourceIndex: ComputedRef<number>;
  attachSource(options?: { readonly autoplay: boolean }): Promise<void>;
  destroyHls(): void;
  resetHlsSourceState(): void;
  setQualityLevel(nextLevel: number): void;
}

export function movieQualityLabel(
  level: MovieHlsQualityLevel | undefined,
  index: number,
  fallbackLabel: (index: number) => string,
): string {
  if (level === undefined) {
    return fallbackLabel(index);
  }

  if (level.height > 0) {
    return `${level.height}p`;
  }

  if (level.bitrate > 0) {
    return `${Math.round(level.bitrate / 1000)} kbps`;
  }

  return fallbackLabel(index);
}

export function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return (
    video.canPlayType("application/vnd.apple.mpegurl").length > 0 ||
    video.canPlayType("application/x-mpegURL").length > 0
  );
}

function loadVideo(video: HTMLVideoElement): void {
  try {
    video.load();
  } catch {
    // Some test/browser environments expose media elements without a usable load implementation.
  }
}

export function useMovieHlsSource({
  play,
  sourceIndex,
  videoElement,
  applyPlaybackSpeed,
  onFatalError,
  onQualityChanged,
  persistPlaybackProgress,
  qualityFallbackLabel,
  requestAutoplayOnce,
  resetPlaybackState,
  setPlaybackError,
}: UseMovieHlsSourceOptions): UseMovieHlsSourceBindings {
  const hlsLevels = ref<readonly MovieHlsQualityLevel[]>([]);
  const selectedQualityLevel = ref(-1);
  const currentLevel = ref(-1);
  const playbackAdMarkers = ref<readonly HlsPlaybackAdMarker[]>([]);

  let hls: Hls | null = null;

  const selectedSourceIndex = computed(() => {
    const sources = play.value.sources;
    if (sources.length === 0) {
      return 0;
    }
    const index = sourceIndex.value;
    return Number.isInteger(index) && index >= 0 && index < sources.length ? index : 0;
  });

  const activeSource = computed(
    () => play.value.sources[selectedSourceIndex.value] ?? play.value.sources[0] ?? null,
  );

  const qualityOptions = computed<readonly MovieQualityOption[]>(() => {
    if (hlsLevels.value.length <= 1) {
      return [];
    }

    return hlsLevels.value.map((level, index) => ({
      label: movieQualityLabel(level, index, qualityFallbackLabel),
      value: index,
    }));
  });

  function destroyHls(): void {
    hls?.destroy();
    hls = null;
  }

  function resetHlsSourceState(): void {
    hlsLevels.value = [];
    selectedQualityLevel.value = -1;
    currentLevel.value = -1;
    playbackAdMarkers.value = [];
  }

  async function attachSource(
    options: { readonly autoplay: boolean } = { autoplay: false },
  ): Promise<void> {
    await nextTick();

    const video = videoElement.value;
    const source = activeSource.value;
    persistPlaybackProgress({ force: true });
    destroyHls();
    resetPlaybackState();

    if (video === null || source === null) {
      return;
    }

    video.removeAttribute("src");
    video.currentTime = 0;
    applyPlaybackSpeed(video);

    if (Hls.isSupported()) {
      let nextHls: Hls | null = null;
      const instance = new Hls(
        createMoviesHlsConfig({
          onAdMarkers: (markers) => {
            if (hls === nextHls) {
              playbackAdMarkers.value = markers;
            }
          },
        }),
      );
      nextHls = instance;
      hls = instance;
      instance.on(Hls.Events.ERROR, onHlsError);
      instance.on(Hls.Events.MANIFEST_PARSED, onHlsManifestParsed);
      instance.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        currentLevel.value = data.level;
      });
      instance.loadSource(source.m3u8Url);
      instance.attachMedia(video);
      if (options.autoplay) {
        video.addEventListener("loadedmetadata", requestAutoplayOnce, { once: true });
      }
      return;
    }

    if (canPlayNativeHls(video)) {
      video.src = source.m3u8Url;
      if (options.autoplay) {
        video.addEventListener("loadedmetadata", requestAutoplayOnce, { once: true });
      }
      loadVideo(video);
      return;
    }

    setPlaybackError("movies.player.error.unsupported");
  }

  function onHlsManifestParsed(_event: string, data: ManifestParsedData): void {
    hlsLevels.value = data.levels.map((level) => ({
      bitrate: level.bitrate,
      height: level.height,
    }));
    currentLevel.value = hls?.currentLevel ?? -1;
  }

  function onHlsError(_event: string, data: ErrorData): void {
    if (data.fatal) {
      setPlaybackError("movies.player.error.streamFailed");
      destroyHls();
      onFatalError();
    }
  }

  function setQualityLevel(nextLevel: number): void {
    if (nextLevel !== -1 && (nextLevel < 0 || nextLevel >= hlsLevels.value.length)) {
      return;
    }

    selectedQualityLevel.value = nextLevel;
    if (hls !== null) {
      hls.currentLevel = nextLevel;
      if (nextLevel === -1) {
        hls.nextLevel = -1;
      }
    }
    onQualityChanged();
  }

  return {
    activeSource,
    currentLevel,
    hlsLevels,
    playbackAdMarkers,
    qualityOptions,
    selectedQualityLevel,
    selectedSourceIndex,
    attachSource,
    destroyHls,
    resetHlsSourceState,
    setQualityLevel,
  };
}
