import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { DEFAULT_SETTINGS } from "./babyTouchSettingsDefaults";
import {
  MAX_ACTIVE_STICKERS,
  REDUCED_MOTION_LIFETIME_MS,
  STICKER_TRAVEL_SPEED_PX_PER_SECOND,
} from "./babyTouchTiming";
import type { BabyTouchSettings } from "./babyTouchTypes";
import { useBabyTouchGame } from "./useBabyTouchGame";

type BabyTouchGameHarnessOptions = Omit<Parameters<typeof useBabyTouchGame>[0], "settings"> & {
  readonly settings?: BabyTouchSettings;
};

const STAGE_SIZE = { width: 200, height: 100 };

function randomSequence(values: readonly number[], fallback = 0.5): () => number {
  let index = 0;

  return () => values[index++] ?? fallback;
}

function stickerTravelSpeed(sticker: { travelX: number; travelY: number; lifetimeMs: number }) {
  return (Math.hypot(sticker.travelX, sticker.travelY) / sticker.lifetimeMs) * 1000;
}

function mountBabyTouchGameHarness(options: BabyTouchGameHarnessOptions = {}) {
  let api!: ReturnType<typeof useBabyTouchGame>;
  const { settings: initialSettings, ...gameOptions } = options;
  const settings = ref<BabyTouchSettings>(initialSettings ?? { ...DEFAULT_SETTINGS });
  const wrapper = mount(
    defineComponent({
      name: "BabyTouchGameHarness",
      setup() {
        api = useBabyTouchGame({ ...gameOptions, settings });
        return () => h("div");
      },
    }),
  );
  return { api, wrapper };
}

describe("useBabyTouchGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("caps rapid multi-touch bursts to the active sticker limit", () => {
    const { api, wrapper } = mountBabyTouchGameHarness();

    for (let index = 0; index < MAX_ACTIVE_STICKERS + 8; index += 1) {
      api.spawnSticker({ x: index / 100, y: 0.5 }, STAGE_SIZE);
    }

    expect(api.stickers.value).toHaveLength(MAX_ACTIVE_STICKERS);
    expect(api.activeCount.value).toBe(MAX_ACTIVE_STICKERS);

    wrapper.unmount();
  });

  it("expires stickers after their animation lifetime", async () => {
    const { api, wrapper } = mountBabyTouchGameHarness();

    const sticker = api.spawnSticker({ x: 0.5, y: 0.5 }, STAGE_SIZE);
    expect(api.stickers.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(sticker.lifetimeMs - 1);
    expect(api.stickers.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(api.stickers.value).toHaveLength(0);

    wrapper.unmount();
  });

  it("shortens sticker lifetime when reduced motion is preferred", async () => {
    const { api, wrapper } = mountBabyTouchGameHarness({
      prefersReducedMotion: () => true,
    });

    const sticker = api.spawnSticker({ x: 0.5, y: 0.5 }, STAGE_SIZE);

    expect(sticker.lifetimeMs).toBe(REDUCED_MOTION_LIFETIME_MS);
    expect(sticker.travelX).toBe(0);
    expect(sticker.travelY).toBe(0);
    await vi.advanceTimersByTimeAsync(REDUCED_MOTION_LIFETIME_MS);
    expect(api.stickers.value).toHaveLength(0);

    wrapper.unmount();
  });

  it("moves near-top-left stickers toward the longer bottom-right route", () => {
    const { api, wrapper } = mountBabyTouchGameHarness({
      random: randomSequence([]),
    });

    const sticker = api.spawnSticker({ x: 0.1, y: 0.1 }, STAGE_SIZE);

    expect(sticker.travelX).toBeGreaterThan(0);
    expect(sticker.travelY).toBeGreaterThan(0);

    wrapper.unmount();
  });

  it("moves near-bottom-right stickers toward the longer top-left route", () => {
    const { api, wrapper } = mountBabyTouchGameHarness({
      random: randomSequence([]),
    });

    const sticker = api.spawnSticker({ x: 0.9, y: 0.9 }, STAGE_SIZE);

    expect(sticker.travelX).toBeLessThan(0);
    expect(sticker.travelY).toBeLessThan(0);

    wrapper.unmount();
  });

  it("breaks equal-distance center directions with randomness", () => {
    const leftUp = mountBabyTouchGameHarness({
      random: randomSequence([0.5, 0.5, 0.5, 0.5, 0.5, 0, 0.5]),
    });
    const rightDown = mountBabyTouchGameHarness({
      random: randomSequence([0.5, 0.5, 0.5, 0.5, 0.5, 0.99, 0.5]),
    });

    const leftUpSticker = leftUp.api.spawnSticker({ x: 0.5, y: 0.5 }, STAGE_SIZE);
    const rightDownSticker = rightDown.api.spawnSticker({ x: 0.5, y: 0.5 }, STAGE_SIZE);

    expect(leftUpSticker.travelX).toBeLessThan(0);
    expect(leftUpSticker.travelY).toBeLessThan(0);
    expect(rightDownSticker.travelX).toBeGreaterThan(0);
    expect(rightDownSticker.travelY).toBeGreaterThan(0);

    leftUp.wrapper.unmount();
    rightDown.wrapper.unmount();
  });

  it("jitters repeated taps so the same point does not always follow the same path", () => {
    const leftJitter = mountBabyTouchGameHarness({
      random: randomSequence([0.5, 0.5, 0.5, 0.5, 0.5, 0]),
    });
    const rightJitter = mountBabyTouchGameHarness({
      random: randomSequence([0.5, 0.5, 0.5, 0.5, 0.5, 1]),
    });

    const firstSticker = leftJitter.api.spawnSticker({ x: 0.1, y: 0.1 }, STAGE_SIZE);
    const secondSticker = rightJitter.api.spawnSticker({ x: 0.1, y: 0.1 }, STAGE_SIZE);

    expect(firstSticker.travelX).toBeGreaterThan(0);
    expect(firstSticker.travelY).toBeGreaterThan(0);
    expect(secondSticker.travelX).toBeGreaterThan(0);
    expect(secondSticker.travelY).toBeGreaterThan(0);
    expect({ x: firstSticker.travelX, y: firstSticker.travelY }).not.toEqual({
      x: secondSticker.travelX,
      y: secondSticker.travelY,
    });

    leftJitter.wrapper.unmount();
    rightJitter.wrapper.unmount();
  });

  it("travels far enough for the sticker to be fully outside the play surface", () => {
    const { api, wrapper } = mountBabyTouchGameHarness({
      random: randomSequence([]),
    });

    const sticker = api.spawnSticker({ x: 0.1, y: 0.1 }, STAGE_SIZE);
    const radius = (128 * sticker.scale) / 2;
    const finalX = sticker.x * STAGE_SIZE.width + sticker.travelX;
    const finalY = sticker.y * STAGE_SIZE.height + sticker.travelY;
    const fullyOutside =
      finalX <= -radius ||
      finalX >= STAGE_SIZE.width + radius ||
      finalY <= -radius ||
      finalY >= STAGE_SIZE.height + radius;

    expect(fullyOutside).toBe(true);

    wrapper.unmount();
  });

  it("derives lifetime from travel distance so sticker speed stays consistent", () => {
    const shortPath = mountBabyTouchGameHarness({
      random: randomSequence([]),
    });
    const longPath = mountBabyTouchGameHarness({
      random: randomSequence([]),
    });

    const shortPathSticker = shortPath.api.spawnSticker({ x: 0.5, y: 0.5 }, STAGE_SIZE);
    const longPathSticker = longPath.api.spawnSticker({ x: 0.1, y: 0.1 }, STAGE_SIZE);

    expect(longPathSticker.lifetimeMs).toBeGreaterThan(shortPathSticker.lifetimeMs);
    expect(stickerTravelSpeed(shortPathSticker)).toBeCloseTo(STICKER_TRAVEL_SPEED_PX_PER_SECOND, 0);
    expect(stickerTravelSpeed(longPathSticker)).toBeCloseTo(STICKER_TRAVEL_SPEED_PX_PER_SECOND, 0);

    shortPath.wrapper.unmount();
    longPath.wrapper.unmount();
  });
});
