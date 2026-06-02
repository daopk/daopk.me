import type { Ref } from "vue";

import { createAudioContext, playStickerTone } from "./babyTouchAudio";
import type { BabyTouchSettings, BabyTouchSticker } from "./babyTouchTypes";

interface BabyTouchSoundOptions {
  readonly settings: Readonly<Ref<BabyTouchSettings>>;
}

export function useBabyTouchSound(options: BabyTouchSoundOptions) {
  let audioContext: ReturnType<typeof createAudioContext> = null;

  function playTapTone(sticker: BabyTouchSticker): void {
    if (!options.settings.value.soundEnabled) {
      return;
    }

    audioContext ??= createAudioContext();
    if (audioContext === null) {
      return;
    }

    playStickerTone(audioContext, sticker, options.settings.value);
  }

  function hasAudioContext(): boolean {
    return audioContext !== null;
  }

  return {
    hasAudioContext,
    playTapTone,
  };
}
