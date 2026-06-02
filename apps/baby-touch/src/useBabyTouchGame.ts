import { computed, onBeforeUnmount, ref, type Ref } from "vue";

import { defaultPrefersReducedMotion } from "./babyTouchMotion";
import { createSticker } from "./babyTouchStickerFactory";
import { MAX_ACTIVE_STICKERS } from "./babyTouchTiming";
import type { BabyTouchPoint, BabyTouchSettings, BabyTouchSticker } from "./babyTouchTypes";

interface BabyTouchGameOptions {
  readonly settings: Readonly<Ref<BabyTouchSettings>>;
  readonly random?: () => number;
  readonly setTimeout?: typeof window.setTimeout;
  readonly clearTimeout?: typeof window.clearTimeout;
  readonly prefersReducedMotion?: () => boolean;
}

export function useBabyTouchGame(options: BabyTouchGameOptions) {
  const random = options.random ?? Math.random;
  const setTimer = options.setTimeout ?? window.setTimeout.bind(window);
  const clearTimer = options.clearTimeout ?? window.clearTimeout.bind(window);
  const prefersReducedMotion = options.prefersReducedMotion ?? defaultPrefersReducedMotion;

  const stickers = ref<BabyTouchSticker[]>([]);
  const reducedMotion = ref(prefersReducedMotion());
  const stickerTimers = new Map<number, ReturnType<typeof setTimer>>();
  const activeCount = computed(() => stickers.value.length);

  let nextStickerId = 1;

  function removeSticker(id: number): void {
    const timer = stickerTimers.get(id);
    if (timer !== undefined) {
      clearTimer(timer);
      stickerTimers.delete(id);
    }
    stickers.value = stickers.value.filter((sticker) => sticker.id !== id);
  }

  function clearStickers(): void {
    for (const timer of stickerTimers.values()) {
      clearTimer(timer);
    }
    stickerTimers.clear();
    stickers.value = [];
  }

  function pruneStaleStickerTimers(): void {
    for (const id of stickerTimers.keys()) {
      if (!stickers.value.some((active) => active.id === id)) {
        const timer = stickerTimers.get(id);
        if (timer !== undefined) clearTimer(timer);
        stickerTimers.delete(id);
      }
    }
  }

  function spawnSticker(point: BabyTouchPoint): BabyTouchSticker {
    reducedMotion.value = prefersReducedMotion();
    const sticker = createSticker(
      nextStickerId,
      point,
      options.settings.value,
      random,
      reducedMotion.value,
    );
    nextStickerId += 1;

    stickers.value = [...stickers.value, sticker].slice(-MAX_ACTIVE_STICKERS);
    pruneStaleStickerTimers();
    stickerTimers.set(
      sticker.id,
      setTimer(() => removeSticker(sticker.id), sticker.lifetimeMs),
    );
    return sticker;
  }

  onBeforeUnmount(() => {
    clearStickers();
  });

  return {
    activeCount,
    clearStickers,
    reducedMotion,
    spawnSticker,
    stickers,
  };
}
