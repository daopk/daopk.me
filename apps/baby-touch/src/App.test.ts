import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import BabyTouchApp from "./App.vue";
import {
  MAX_ACTIVE_STICKERS,
  PARENT_HOLD_MS,
  REDUCED_MOTION_LIFETIME_MS,
  STICKER_LIFETIME_MS,
  useBabyTouch,
} from "./useBabyTouch";

function setSurfaceRect(wrapper: VueWrapper, width = 200, height = 100): void {
  const surface = wrapper.find('[data-testid="baby-touch-surface"]');
  Object.defineProperty(surface.element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: height,
      height,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

function mountBabyTouchHarness(options: Parameters<typeof useBabyTouch>[0] = {}) {
  let api!: ReturnType<typeof useBabyTouch>;
  const wrapper = mount(
    defineComponent({
      name: "BabyTouchHarness",
      setup() {
        api = useBabyTouch(options);
        return () => h("div");
      },
    }),
  );
  return { api, wrapper };
}

class FakeAudioParam {
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeOscillator {
  frequency = new FakeAudioParam();
  type: OscillatorType = "sine";
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = new FakeAudioParam();
  connect = vi.fn();
}

class FakeAudioContext {
  currentTime = 0;
  destination = {} as AudioNode;
  state = "running";
  createGain = vi.fn(() => new FakeGain() as unknown as GainNode);
  createOscillator = vi.fn(() => new FakeOscillator() as unknown as OscillatorNode);
  resume = vi.fn(async () => undefined);
}

describe("Baby Touch App", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders the play surface first with parent settings hidden", () => {
    const wrapper = mount(BabyTouchApp);

    expect(wrapper.find('[data-testid="baby-touch-surface"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="baby-touch-settings"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="baby-touch-sticker"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("creates a sticker at normalized pointer coordinates", async () => {
    const wrapper = mount(BabyTouchApp);
    setSurfaceRect(wrapper);

    await wrapper.find('[data-testid="baby-touch-surface"]').trigger("pointerdown", {
      clientX: 50,
      clientY: 25,
      pointerId: 1,
    });

    const sticker = wrapper.find('[data-testid="baby-touch-sticker"]');
    expect(sticker.exists()).toBe(true);
    expect(sticker.attributes("style")).toContain("--baby-touch-x: 25%");
    expect(sticker.attributes("style")).toContain("--baby-touch-y: 25%");

    wrapper.unmount();
  });
});

describe("useBabyTouch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("caps rapid multi-touch bursts to the active sticker limit", () => {
    const { api, wrapper } = mountBabyTouchHarness();

    for (let index = 0; index < MAX_ACTIVE_STICKERS + 8; index += 1) {
      api.spawnSticker({ x: index / 100, y: 0.5 });
    }

    expect(api.stickers.value).toHaveLength(MAX_ACTIVE_STICKERS);
    expect(api.activeCount.value).toBe(MAX_ACTIVE_STICKERS);

    wrapper.unmount();
  });

  it("expires stickers after their animation lifetime", async () => {
    const { api, wrapper } = mountBabyTouchHarness();

    api.spawnSticker({ x: 0.5, y: 0.5 });
    expect(api.stickers.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(STICKER_LIFETIME_MS - 1);
    expect(api.stickers.value).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(api.stickers.value).toHaveLength(0);

    wrapper.unmount();
  });

  it("shortens sticker lifetime when reduced motion is preferred", async () => {
    const { api, wrapper } = mountBabyTouchHarness({
      prefersReducedMotion: () => true,
    });

    const sticker = api.spawnSticker({ x: 0.5, y: 0.5 });

    expect(sticker.lifetimeMs).toBe(REDUCED_MOTION_LIFETIME_MS);
    await vi.advanceTimersByTimeAsync(REDUCED_MOTION_LIFETIME_MS);
    expect(api.stickers.value).toHaveLength(0);

    wrapper.unmount();
  });

  it("opens parent settings only after both top corners are held", async () => {
    const { api, wrapper } = mountBabyTouchHarness();

    expect(api.handleParentCornerDown(1, { x: 0.08, y: 0.08 })).toBe(true);
    await vi.advanceTimersByTimeAsync(PARENT_HOLD_MS);
    expect(api.settingsOpen.value).toBe(false);

    api.handleParentCornerUp(1);
    expect(api.handleParentCornerDown(2, { x: 0.08, y: 0.08 })).toBe(true);
    expect(api.handleParentCornerDown(3, { x: 0.92, y: 0.08 })).toBe(true);
    await vi.advanceTimersByTimeAsync(PARENT_HOLD_MS - 1);
    expect(api.settingsOpen.value).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(api.settingsOpen.value).toBe(true);

    wrapper.unmount();
  });

  it("cancels a short or partial parent hold", async () => {
    const { api, wrapper } = mountBabyTouchHarness();

    api.handleParentCornerDown(1, { x: 0.08, y: 0.08 });
    api.handleParentCornerDown(2, { x: 0.92, y: 0.08 });
    await vi.advanceTimersByTimeAsync(PARENT_HOLD_MS - 200);
    api.handleParentCornerUp(2);
    await vi.advanceTimersByTimeAsync(300);

    expect(api.settingsOpen.value).toBe(false);

    wrapper.unmount();
  });

  it("does not create an audio context until sound is enabled", () => {
    let createdAudioContexts = 0;
    class CountingAudioContext extends FakeAudioContext {
      constructor() {
        super();
        createdAudioContexts += 1;
      }
    }
    vi.stubGlobal("AudioContext", CountingAudioContext);
    const { api, wrapper } = mountBabyTouchHarness();

    const sticker = api.spawnSticker({ x: 0.4, y: 0.4 });
    api.playTapTone(sticker);

    expect(createdAudioContexts).toBe(0);
    expect(api.hasAudioContext()).toBe(false);

    api.updateSettings({ soundEnabled: true });
    api.playTapTone(sticker);

    expect(createdAudioContexts).toBe(1);
    expect(api.hasAudioContext()).toBe(true);

    wrapper.unmount();
  });

  it("persists parent settings and reloads them", async () => {
    const first = mountBabyTouchHarness({ storage: localStorage });

    first.api.updateSettings({
      scene: "animals",
      intensity: "lively",
      soundEnabled: true,
      volume: 72,
    });
    await nextTick();
    first.wrapper.unmount();

    const second = mountBabyTouchHarness({ storage: localStorage });

    expect(second.api.settings.value).toEqual({
      scene: "animals",
      intensity: "lively",
      soundEnabled: true,
      volume: 72,
    });

    second.wrapper.unmount();
  });
});
