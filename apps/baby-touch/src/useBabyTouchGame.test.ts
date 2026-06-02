import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { DEFAULT_SETTINGS } from "./babyTouchSettingsDefaults";
import {
  MAX_ACTIVE_STICKERS,
  REDUCED_MOTION_LIFETIME_MS,
  STICKER_LIFETIME_MS,
} from "./babyTouchTiming";
import type { BabyTouchSettings } from "./babyTouchTypes";
import { useBabyTouchGame } from "./useBabyTouchGame";

type BabyTouchGameHarnessOptions = Omit<Parameters<typeof useBabyTouchGame>[0], "settings"> & {
  readonly settings?: BabyTouchSettings;
};

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
      api.spawnSticker({ x: index / 100, y: 0.5 });
    }

    expect(api.stickers.value).toHaveLength(MAX_ACTIVE_STICKERS);
    expect(api.activeCount.value).toBe(MAX_ACTIVE_STICKERS);

    wrapper.unmount();
  });

  it("expires stickers after their animation lifetime", async () => {
    const { api, wrapper } = mountBabyTouchGameHarness();

    api.spawnSticker({ x: 0.5, y: 0.5 });
    expect(api.stickers.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(STICKER_LIFETIME_MS - 1);
    expect(api.stickers.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(api.stickers.value).toHaveLength(0);

    wrapper.unmount();
  });

  it("shortens sticker lifetime when reduced motion is preferred", async () => {
    const { api, wrapper } = mountBabyTouchGameHarness({
      prefersReducedMotion: () => true,
    });

    const sticker = api.spawnSticker({ x: 0.5, y: 0.5 });

    expect(sticker.lifetimeMs).toBe(REDUCED_MOTION_LIFETIME_MS);
    await vi.advanceTimersByTimeAsync(REDUCED_MOTION_LIFETIME_MS);
    expect(api.stickers.value).toHaveLength(0);

    wrapper.unmount();
  });
});
