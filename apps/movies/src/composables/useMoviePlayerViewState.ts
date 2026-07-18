import { computed, type ComputedRef, type Ref } from "vue";

import type { HlsPlaybackAdMarker } from "../hls/hlsAdSkip";
import type { MoviesTranslate } from "../i18n/useMoviesI18n";
import { moviePlayerAdMarkerTrackBackground } from "../utils/moviePlayerAdMarkers";
import { formatMoviePlayerTime } from "../utils/moviePlayerTime";
import { clampNumber } from "../utils/number";
import {
  movieQualityLabel,
  type MovieHlsQualityLevel,
  type MovieQualityOption,
} from "./useMovieHlsSource";
import { moviePlaybackSpeedLabel as speedLabel } from "./useMoviePlaybackState";

interface MoviePlayerViewProps {
  readonly nextEpisodeLabel: string;
  readonly posterUrl: string;
}

interface UseMoviePlayerViewStateOptions {
  readonly bufferedEnd: Ref<number>;
  readonly currentLevel: Ref<number>;
  readonly currentTime: Ref<number>;
  readonly duration: Ref<number>;
  readonly fullscreen: Ref<boolean>;
  readonly hasDuration: ComputedRef<boolean>;
  readonly hlsLevels: Ref<readonly MovieHlsQualityLevel[]>;
  readonly mutedOrSilent: ComputedRef<boolean>;
  readonly pictureInPicture: Ref<boolean>;
  readonly playbackAdMarkers: Ref<readonly HlsPlaybackAdMarker[]>;
  readonly playbackError: ComputedRef<string>;
  readonly playbackSpeed: Ref<number>;
  readonly playing: Ref<boolean>;
  readonly props: Readonly<MoviePlayerViewProps>;
  readonly qualityFallbackLabel: (index: number) => string;
  readonly qualityOptions: ComputedRef<readonly MovieQualityOption[]>;
  readonly seeking: Ref<boolean>;
  readonly seekPointerPreview: Ref<{ leftPx: number; seconds: number } | null>;
  readonly seekPosition: Ref<number>;
  readonly selectedQualityLevel: Ref<number>;
  readonly seekPreviewThumbSizePx: number;
  readonly t: MoviesTranslate;
  readonly waiting: Ref<boolean>;
}

export function useMoviePlayerViewState({
  bufferedEnd,
  currentLevel,
  currentTime,
  duration,
  fullscreen,
  hasDuration,
  hlsLevels,
  mutedOrSilent,
  pictureInPicture,
  playbackAdMarkers,
  playbackError,
  playbackSpeed,
  playing,
  props,
  qualityFallbackLabel,
  qualityOptions,
  seeking,
  seekPointerPreview,
  seekPosition,
  selectedQualityLevel,
  seekPreviewThumbSizePx,
  t,
  waiting,
}: UseMoviePlayerViewStateOptions) {
  const hasQualityMenu = computed(() => qualityOptions.value.length > 0);
  const hasSettingsMenu = computed(() => true);
  const selectedQualityLabel = computed(() => {
    if (!hasQualityMenu.value) {
      return "";
    }

    if (selectedQualityLevel.value === -1) {
      return currentLevel.value >= 0
        ? t("movies.player.autoQuality", {
            quality: movieQualityLabel(
              hlsLevels.value[currentLevel.value],
              currentLevel.value,
              qualityFallbackLabel,
            ),
          })
        : t("movies.player.auto");
    }

    return (
      qualityOptions.value.find((option) => option.value === selectedQualityLevel.value)?.label ??
      t("movies.player.auto")
    );
  });
  const selectedPlaybackSpeedStatus = computed(() =>
    playbackSpeed.value === 1 ? "" : speedLabel(playbackSpeed.value),
  );
  const sourceStatusText = computed(() => {
    const parts = [selectedQualityLabel.value, selectedPlaybackSpeedStatus.value].filter(
      (part) => part.length > 0,
    );
    return parts.join(" - ");
  });
  const loadedFraction = computed(() =>
    hasDuration.value ? clampNumber(bufferedEnd.value / duration.value, 0, 1) : 0,
  );
  const seekMax = computed(() => Math.max(1, Math.round(duration.value)));
  const displayTime = computed(() => (seeking.value ? seekPosition.value : currentTime.value));
  const playedFraction = computed(() =>
    hasDuration.value ? clampNumber(displayTime.value / duration.value, 0, 1) : 0,
  );
  const seekValueText = computed(() =>
    hasDuration.value
      ? t("movies.player.seekValue", {
          duration: formatMoviePlayerTime(duration.value),
          time: formatMoviePlayerTime(seekPosition.value),
        })
      : formatMoviePlayerTime(seekPosition.value),
  );
  const muteLabel = computed(() =>
    mutedOrSilent.value ? t("movies.player.unmute") : t("movies.player.mute"),
  );
  const fullscreenLabel = computed(() =>
    fullscreen.value ? t("movies.player.fullscreen.exit") : t("movies.player.fullscreen.enter"),
  );
  const pictureInPictureLabel = computed(() =>
    pictureInPicture.value
      ? t("movies.player.pictureInPicture.exit")
      : t("movies.player.pictureInPicture.enter"),
  );
  const nextEpisodeButtonLabel = computed(() => props.nextEpisodeLabel.trim());
  const showNextEpisodeButton = computed(() => nextEpisodeButtonLabel.value.length > 0);
  const posterVisible = computed(
    () => !playing.value && currentTime.value === 0 && props.posterUrl.length > 0,
  );
  const showCenterPlay = computed(() => !playing.value && playbackError.value.length === 0);
  const showSpinner = computed(() => waiting.value && playbackError.value.length === 0);
  const controlsStyle = computed<Record<string, string>>(() => ({
    "--movies-player-ad-markers": adMarkersBackground.value,
    "--movies-player-loaded": String(loadedFraction.value),
    "--movies-player-played": String(playedFraction.value),
    "--movies-player-preview-left": `${
      seekPointerPreview.value?.leftPx ?? seekPreviewThumbSizePx / 2
    }px`,
    "--movies-player-slider-thumb-size": `${seekPreviewThumbSizePx}px`,
  }));
  const hasPlaybackAdMarkers = computed(
    () => hasDuration.value && playbackAdMarkers.value.length > 0,
  );
  const adMarkersBackground = computed(() =>
    hasDuration.value
      ? moviePlayerAdMarkerTrackBackground(playbackAdMarkers.value, duration.value)
      : "none",
  );
  const seekPointerPreviewText = computed(() =>
    seekPointerPreview.value === null
      ? ""
      : formatMoviePlayerTime(seekPointerPreview.value.seconds),
  );

  return {
    controlsStyle,
    displayTime,
    formatTime: formatMoviePlayerTime,
    fullscreenLabel,
    hasPlaybackAdMarkers,
    hasQualityMenu,
    hasSettingsMenu,
    muteLabel,
    nextEpisodeButtonLabel,
    pictureInPictureLabel,
    posterVisible,
    seekMax,
    seekPointerPreviewText,
    seekValueText,
    showCenterPlay,
    showNextEpisodeButton,
    showSpinner,
    sourceStatusText,
  };
}
