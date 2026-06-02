import type { BabyTouchSettings, BabyTouchSticker } from "./babyTouchTypes";

interface MinimalAudioContext {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly state?: string;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  resume?: () => Promise<void>;
}

type MinimalAudioContextConstructor = new () => MinimalAudioContext;

export function createAudioContext(): MinimalAudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const audioGlobal = globalThis as typeof globalThis & {
    AudioContext?: MinimalAudioContextConstructor;
    webkitAudioContext?: MinimalAudioContextConstructor;
  };
  const AudioContextConstructor = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
  return AudioContextConstructor === undefined ? null : new AudioContextConstructor();
}

export function playStickerTone(
  audioContext: MinimalAudioContext,
  sticker: BabyTouchSticker,
  settings: BabyTouchSettings,
): void {
  if (audioContext.state === "suspended" && audioContext.resume !== undefined) {
    void audioContext.resume();
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const start = audioContext.currentTime;
  const frequency = 360 + ((sticker.hue + sticker.id * 31) % 260);
  const peak = Math.max(0.0001, (settings.volume / 100) * 0.055);

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.24);
}
