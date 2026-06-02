import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { STICKER_LIFETIME_MS } from "./babyTouchTiming";
import type { BabyTouchSettings, BabyTouchSticker } from "./babyTouchTypes";
import { useBabyTouchSound } from "./useBabyTouchSound";

function makeSticker(overrides: Partial<BabyTouchSticker> = {}): BabyTouchSticker {
  return {
    family: "animal",
    hue: 120,
    id: 1,
    kind: "bear",
    lifetimeMs: STICKER_LIFETIME_MS,
    mirror: false,
    scale: 1,
    spin: 0,
    x: 0.4,
    y: 0.4,
    ...overrides,
  };
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

describe("useBabyTouchSound", () => {
  it("does not create an audio context until sound is enabled", () => {
    let createdAudioContexts = 0;
    class CountingAudioContext extends FakeAudioContext {
      constructor() {
        super();
        createdAudioContexts += 1;
      }
    }
    vi.stubGlobal("AudioContext", CountingAudioContext);
    const settings = ref<BabyTouchSettings>({
      background: "sky",
      scene: "animals",
      intensity: "gentle",
      soundEnabled: false,
      volume: 35,
    });
    const api = useBabyTouchSound({ settings });
    const sticker = makeSticker();

    api.playTapTone(sticker);

    expect(createdAudioContexts).toBe(0);
    expect(api.hasAudioContext()).toBe(false);

    settings.value = { ...settings.value, soundEnabled: true };
    api.playTapTone(sticker);

    expect(createdAudioContexts).toBe(1);
    expect(api.hasAudioContext()).toBe(true);

    vi.unstubAllGlobals();
  });
});
