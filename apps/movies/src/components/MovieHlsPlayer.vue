<script setup vapor lang="ts">
import { IconButton } from "@daopk/kit";
import {
  DropdownMenu,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  Slider,
} from "@daopk/ui";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PictureInPicture,
  PictureInPicture2,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
} from "@daopk/icons";

import { useMoviesI18n } from "../i18n/useMoviesI18n";
import {
  useMovieHlsPlayerController,
  type MovieHlsPlayerProps,
} from "../composables/useMovieHlsPlayerController";

const props = withDefaults(defineProps<MovieHlsPlayerProps>(), {
  autoplay: false,
  nextEpisodeLabel: "",
  playbackSpeed: 1,
  posterUrl: "",
  progressKey: "",
  showBackButton: false,
  sourceIndex: 0,
});

const emit = defineEmits<{
  back: [];
  "next-episode": [];
  "update:playbackSpeed": [speed: number];
}>();

const { t } = useMoviesI18n();
const {
  cancelSeekPreview,
  commitSeek,
  controlsFocused,
  controlsHidden,
  controlsStyle,
  displayTime,
  duration,
  formatTime,
  fullscreen,
  fullscreenLabel,
  handleAppKeydown,
  hasDuration,
  hasPlaybackAdMarkers,
  hasQualityMenu,
  hasSettingsMenu,
  muteLabel,
  mutedOrSilent,
  nextEpisodeButtonLabel,
  onCenterPlayClick,
  onCenterPlayDoubleClick,
  onControlsFocusOut,
  onLoadedMetadata,
  onPlayerSurfaceClick,
  onPlayerSurfaceDoubleClick,
  onProgress,
  onSeekKeydown,
  onSeekPointerCancel,
  onSeekPointerDown,
  onSeekPointerLeave,
  onSeekPointerMove,
  onSeekPointerUp,
  onStageKeydown,
  onStageKeydownCapture,
  onTimeUpdate,
  onVideoCanPlay,
  onVideoEnded,
  onVideoError,
  onVideoPause,
  onVideoPlay,
  onVideoWaiting,
  pictureInPicture,
  pictureInPictureLabel,
  pictureInPictureSupported,
  playbackError,
  playbackSpeedOptions,
  playbackSpeedSelectValue,
  playerShell,
  posterVisible,
  previewSeek,
  qualityOptions,
  qualitySelectValue,
  seekMax,
  seekPointerPreview,
  seekPointerPreviewText,
  seekPosition,
  seekValueText,
  setVolumeFromSlider,
  showCenterPlay,
  showControls,
  showNextEpisodeButton,
  showSpinner,
  sourceStatusText,
  speedLabel,
  syncMediaState,
  syncVideoAspectRatio,
  toggleFullscreen,
  toggleMute,
  togglePictureInPicture,
  volumeSliderValue,
} = useMovieHlsPlayerController({
  emitPlaybackSpeed: (speed) => {
    emit("update:playbackSpeed", speed);
  },
  props,
  t,
});

defineExpose({
  handleAppKeydown,
});
</script>
<template>
  <div class="movies-hls-player">
    <div
      ref="playerShell"
      class="movies-hls-player__stage"
      :class="{
        'movies-hls-player__stage--controls-hidden': controlsHidden,
        'movies-hls-player__stage--fullscreen': fullscreen,
      }"
      tabindex="0"
      :aria-label="t('movies.player.ariaLabel', { title })"
      @keydown.capture="onStageKeydownCapture"
      @keydown="onStageKeydown"
      @click="onPlayerSurfaceClick"
      @dblclick="onPlayerSurfaceDoubleClick"
      @pointerdown="showControls"
      @pointermove="showControls"
      @touchstart="showControls"
    >
      <video
        ref="videoElement"
        class="movies-hls-player__video"
        playsinline
        preload="metadata"
        :poster="posterUrl || undefined"
        @canplay="onVideoCanPlay"
        @durationchange="syncMediaState"
        @ended="onVideoEnded"
        @error="onVideoError"
        @loadedmetadata="onLoadedMetadata"
        @pause="onVideoPause"
        @play="onVideoPlay"
        @playing="onVideoCanPlay"
        @progress="onProgress"
        @ratechange="syncMediaState"
        @resize="syncVideoAspectRatio"
        @timeupdate="onTimeUpdate"
        @volumechange="syncMediaState"
        @waiting="onVideoWaiting"
      />

      <Transition name="movies-hls-player__poster-fade">
        <div v-if="posterVisible" class="movies-hls-player__poster" aria-hidden="true">
          <img :src="posterUrl" alt="" decoding="async" />
        </div>
      </Transition>

      <div class="movies-hls-player__shade movies-hls-player__shade--top" aria-hidden="true" />
      <div class="movies-hls-player__shade movies-hls-player__shade--bottom" aria-hidden="true" />

      <button
        v-if="showCenterPlay"
        type="button"
        class="movies-hls-player__center-play"
        :aria-label="t('movies.action.play')"
        @click="onCenterPlayClick"
        @dblclick="onCenterPlayDoubleClick"
      >
        <Play aria-hidden="true" />
      </button>

      <div v-if="showSpinner" class="movies-hls-player__spinner" role="status" aria-live="polite">
        <span>{{ t("movies.player.loadingVideo") }}</span>
      </div>

      <p v-if="playbackError" class="movies-hls-player__error" role="alert">
        <AlertCircle aria-hidden="true" />
        <span>{{ playbackError }}</span>
      </p>

      <div
        v-if="!pictureInPicture"
        ref="topbarControlsRoot"
        class="movies-hls-player__topbar"
        :class="{
          'movies-hls-player__topbar--hidden': controlsHidden,
          'movies-hls-player__topbar--with-back': showBackButton,
        }"
      >
        <div
          v-if="showBackButton"
          ref="backControlsRoot"
          class="movies-hls-player__back-action"
          @focusin="
            controlsFocused = true;
            showControls();
          "
          @focusout="onControlsFocusOut"
          @click.stop
          @dblclick.stop
          @pointerdown="showControls"
          @pointermove="showControls"
          @touchstart="showControls"
        >
          <IconButton
            class="movies-hls-player__button movies-hls-player__back-button"
            :icon="ChevronLeft"
            :label="t('movies.action.back')"
            size="sm"
            variant="subtle"
            @click="emit('back')"
          />
        </div>

        <div class="movies-hls-player__topline">
          <span class="movies-hls-player__title">{{ title }}</span>
          <span v-if="sourceStatusText" class="movies-hls-player__source-status">
            {{ sourceStatusText }}
          </span>
        </div>

        <div
          class="movies-hls-player__top-actions"
          @focusin="
            controlsFocused = true;
            showControls();
          "
          @focusout="onControlsFocusOut"
          @click.stop
          @dblclick.stop
          @pointerdown="showControls"
          @pointermove="showControls"
          @touchstart="showControls"
        >
          <IconButton
            class="movies-hls-player__button movies-hls-player__top-volume-button"
            :icon="mutedOrSilent ? VolumeX : Volume2"
            :label="muteLabel"
            size="sm"
            variant="subtle"
            :disabled="playbackError.length > 0"
            @click="toggleMute"
          />
        </div>
      </div>

      <div
        ref="controlsRoot"
        class="movies-hls-player__controls"
        :class="{ 'movies-hls-player__controls--hidden': controlsHidden }"
        :style="controlsStyle"
        :aria-label="t('movies.player.controls.ariaLabel')"
        @focusin="
          controlsFocused = true;
          showControls();
        "
        @focusout="onControlsFocusOut"
        @click.stop
        @dblclick.stop
        @pointerdown="showControls"
        @pointermove="showControls"
        @touchstart="showControls"
      >
        <div
          class="movies-hls-player__control-row"
          :class="{ 'movies-hls-player__control-row--has-settings': hasSettingsMenu }"
        >
          <span class="movies-hls-player__time">
            {{ formatTime(displayTime) }}
          </span>

          <div
            ref="progressRoot"
            class="movies-hls-player__progress"
            @pointercancel="onSeekPointerCancel"
            @pointerdown="onSeekPointerDown"
            @pointerleave="onSeekPointerLeave"
            @pointermove="onSeekPointerMove"
            @pointerup="onSeekPointerUp"
          >
            <span
              v-if="hasPlaybackAdMarkers"
              class="movies-hls-player__ad-markers"
              aria-hidden="true"
            />
            <Slider
              class="movies-hls-player__seek"
              :model-value="seekPosition"
              :min="0"
              :max="seekMax"
              :step="1"
              :disabled="!hasDuration || playbackError.length > 0"
              :aria-label="t('movies.player.seek')"
              :aria-valuetext="seekValueText"
              @focusout="cancelSeekPreview"
              @keydown="onSeekKeydown"
              @update:model-value="previewSeek"
              @commit="commitSeek"
            />
            <span
              v-if="seekPointerPreview"
              class="movies-hls-player__seek-preview"
              aria-hidden="true"
            >
              {{ seekPointerPreviewText }}
            </span>
          </div>

          <span class="movies-hls-player__duration">
            {{ hasDuration ? formatTime(duration) : "--:--" }}
          </span>

          <div class="movies-hls-player__volume-control">
            <IconButton
              class="movies-hls-player__button"
              :icon="mutedOrSilent ? VolumeX : Volume2"
              :label="muteLabel"
              size="sm"
              variant="subtle"
              :disabled="playbackError.length > 0"
              @click="toggleMute"
            />

            <div class="movies-hls-player__volume-popover">
              <Slider
                class="movies-hls-player__volume"
                orientation="vertical"
                :model-value="volumeSliderValue"
                :min="0"
                :max="100"
                :step="1"
                :disabled="playbackError.length > 0"
                :aria-label="t('movies.player.volume')"
                :aria-valuetext="`${volumeSliderValue}%`"
                @update:model-value="setVolumeFromSlider"
                @commit="setVolumeFromSlider"
              />
            </div>
          </div>

          <IconButton
            v-if="showNextEpisodeButton"
            class="movies-hls-player__button movies-hls-player__next-episode-button"
            :icon="SkipForward"
            :label="nextEpisodeButtonLabel"
            size="sm"
            variant="subtle"
            @click="emit('next-episode')"
          />

          <IconButton
            v-if="pictureInPictureSupported"
            class="movies-hls-player__button movies-hls-player__pip-button"
            :icon="pictureInPicture ? PictureInPicture : PictureInPicture2"
            :label="pictureInPictureLabel"
            size="sm"
            variant="subtle"
            :disabled="playbackError.length > 0"
            @click="togglePictureInPicture"
          />

          <DropdownMenu
            v-if="hasSettingsMenu"
            align="end"
            content-class="movies-hls-player__settings-menu"
            :portal-to="playerShell ?? 'body'"
          >
            <template #trigger>
              <IconButton
                class="movies-hls-player__button"
                :icon="MoreHorizontal"
                :label="t('movies.player.settings')"
                size="sm"
                variant="subtle"
              />
            </template>
            <template #items>
              <DropdownMenuLabel class="ds-dropdown-menu__label">
                {{ t("movies.player.speed") }}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup v-model="playbackSpeedSelectValue">
                <DropdownMenuRadioItem
                  v-for="speed in playbackSpeedOptions"
                  :key="speed"
                  :value="String(speed)"
                  :text-value="speedLabel(speed)"
                >
                  <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">
                    <Check aria-hidden="true" />
                  </DropdownMenuItemIndicator>
                  {{ speedLabel(speed) }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator v-if="hasQualityMenu" />

              <DropdownMenuLabel v-if="hasQualityMenu" class="ds-dropdown-menu__label">
                {{ t("movies.player.quality") }}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup v-if="hasQualityMenu" v-model="qualitySelectValue">
                <DropdownMenuRadioItem value="-1" :text-value="t('movies.player.auto')">
                  <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">
                    <Check aria-hidden="true" />
                  </DropdownMenuItemIndicator>
                  {{ t("movies.player.auto") }}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  v-for="quality in qualityOptions"
                  :key="quality.value"
                  :value="String(quality.value)"
                  :text-value="quality.label"
                >
                  <DropdownMenuItemIndicator class="ds-dropdown-menu__indicator">
                    <Check aria-hidden="true" />
                  </DropdownMenuItemIndicator>
                  {{ quality.label }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </template>
          </DropdownMenu>

          <IconButton
            v-if="!pictureInPicture"
            class="movies-hls-player__button movies-hls-player__fullscreen-button"
            :icon="fullscreen ? Minimize2 : Maximize2"
            :label="fullscreenLabel"
            size="sm"
            variant="subtle"
            @click="toggleFullscreen"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss" src="../styles/movie-hls-player.scss"></style>
