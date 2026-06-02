import { computed, onBeforeUnmount, ref, watch } from "vue";

export type BabyTouchScene = "animals" | "shapes" | "bubbles" | "mix";
export type BabyTouchIntensity = "gentle" | "lively";
export type BabyTouchFamily = "animal" | "shape" | "bubble";

export interface BabyTouchSettings {
  readonly scene: BabyTouchScene;
  readonly intensity: BabyTouchIntensity;
  readonly soundEnabled: boolean;
  readonly volume: number;
}

export interface BabyTouchPoint {
  readonly x: number;
  readonly y: number;
}

export interface BabyTouchSticker {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly family: BabyTouchFamily;
  readonly kind: string;
  readonly hue: number;
  readonly spin: number;
  readonly scale: number;
  readonly mirror: boolean;
  readonly lifetimeMs: number;
}

interface BabyTouchOptions {
  readonly storage?: Storage;
  readonly random?: () => number;
  readonly setTimeout?: typeof window.setTimeout;
  readonly clearTimeout?: typeof window.clearTimeout;
  readonly prefersReducedMotion?: () => boolean;
}

interface MinimalAudioContext {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly state?: string;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  resume?: () => Promise<void>;
}

type MinimalAudioContextConstructor = new () => MinimalAudioContext;

const STORAGE_KEY = "daopk:baby-touch:settings";

export const MAX_ACTIVE_STICKERS = 24;
export const STICKER_LIFETIME_MS = 1600;
export const REDUCED_MOTION_LIFETIME_MS = 700;
export const PARENT_HOLD_MS = 2000;

const DEFAULT_SETTINGS: BabyTouchSettings = {
  scene: "mix",
  intensity: "gentle",
  soundEnabled: false,
  volume: 35,
};

const ANIMAL_KINDS = ["bear", "cat", "frog", "lion"] as const;
const SHAPE_KINDS = ["flower", "heart", "moon", "star"] as const;
const BUBBLE_KINDS = ["bubble", "double-bubble", "ring"] as const;

function isScene(value: unknown): value is BabyTouchScene {
  return value === "animals" || value === "shapes" || value === "bubbles" || value === "mix";
}

function isIntensity(value: unknown): value is BabyTouchIntensity {
  return value === "gentle" || value === "lively";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function defaultPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function loadSettings(storage: Storage | undefined): BabyTouchSettings {
  if (storage === undefined) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { ...DEFAULT_SETTINGS };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { ...DEFAULT_SETTINGS };
    }

    return {
      scene: isScene(parsed.scene) ? parsed.scene : DEFAULT_SETTINGS.scene,
      intensity: isIntensity(parsed.intensity) ? parsed.intensity : DEFAULT_SETTINGS.intensity,
      soundEnabled:
        typeof parsed.soundEnabled === "boolean"
          ? parsed.soundEnabled
          : DEFAULT_SETTINGS.soundEnabled,
      volume:
        typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? clamp(Math.round(parsed.volume), 0, 100)
          : DEFAULT_SETTINGS.volume,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(storage: Storage | undefined, settings: BabyTouchSettings): void {
  if (storage === undefined) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private browsing or test harnesses.
  }
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

function resolveFamily(scene: BabyTouchScene, random: () => number): BabyTouchFamily {
  if (scene === "animals") return "animal";
  if (scene === "shapes") return "shape";
  if (scene === "bubbles") return "bubble";
  return pick(["animal", "shape", "bubble"] as const, random);
}

function resolveKind(family: BabyTouchFamily, random: () => number): string {
  if (family === "animal") return pick(ANIMAL_KINDS, random);
  if (family === "shape") return pick(SHAPE_KINDS, random);
  return pick(BUBBLE_KINDS, random);
}

function cornerForPoint(point: BabyTouchPoint): "left" | "right" | null {
  if (point.y > 0.22) {
    return null;
  }
  if (point.x < 0.22) {
    return "left";
  }
  if (point.x > 0.78) {
    return "right";
  }
  return null;
}

function createAudioContext(): MinimalAudioContext | null {
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

export function useBabyTouch(options: BabyTouchOptions = {}) {
  const storage = options.storage ?? defaultStorage();
  const random = options.random ?? Math.random;
  const setTimer = options.setTimeout ?? window.setTimeout.bind(window);
  const clearTimer = options.clearTimeout ?? window.clearTimeout.bind(window);
  const prefersReducedMotion = options.prefersReducedMotion ?? defaultPrefersReducedMotion;

  const settings = ref<BabyTouchSettings>(loadSettings(storage));
  const stickers = ref<BabyTouchSticker[]>([]);
  const settingsOpen = ref(false);
  const reducedMotion = ref(prefersReducedMotion());

  let nextStickerId = 1;
  let audioContext: MinimalAudioContext | null = null;
  let parentHoldTimer: ReturnType<typeof setTimer> | null = null;

  const stickerTimers = new Map<number, ReturnType<typeof setTimer>>();
  const cornerPointers = new Map<number, "left" | "right">();

  const activeCount = computed(() => stickers.value.length);
  const settingsLabel = computed(() => {
    const sceneLabel = settings.value.scene === "mix" ? "Mix" : settings.value.scene;
    return `${sceneLabel} scene`;
  });

  watch(
    settings,
    (next) => {
      persistSettings(storage, next);
    },
    { deep: true },
  );

  function updateSettings(partial: Partial<BabyTouchSettings>): void {
    settings.value = {
      ...settings.value,
      ...partial,
      volume:
        partial.volume === undefined
          ? settings.value.volume
          : clamp(Math.round(partial.volume), 0, 100),
    };
  }

  function resetSettings(): void {
    settings.value = { ...DEFAULT_SETTINGS };
  }

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

  function spawnSticker(point: BabyTouchPoint): BabyTouchSticker {
    reducedMotion.value = prefersReducedMotion();
    const family = resolveFamily(settings.value.scene, random);
    const sticker: BabyTouchSticker = {
      id: nextStickerId,
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
      family,
      kind: resolveKind(family, random),
      hue: Math.round(random() * 330),
      spin: Math.round((random() - 0.5) * (settings.value.intensity === "lively" ? 34 : 18)),
      scale: Number(
        (0.92 + random() * (settings.value.intensity === "lively" ? 0.34 : 0.22)).toFixed(2),
      ),
      mirror: random() > 0.5,
      lifetimeMs: reducedMotion.value ? REDUCED_MOTION_LIFETIME_MS : STICKER_LIFETIME_MS,
    };
    nextStickerId += 1;

    stickers.value = [...stickers.value, sticker].slice(-MAX_ACTIVE_STICKERS);
    for (const id of [...stickerTimers.keys()]) {
      if (!stickers.value.some((active) => active.id === id)) {
        const timer = stickerTimers.get(id);
        if (timer !== undefined) clearTimer(timer);
        stickerTimers.delete(id);
      }
    }
    stickerTimers.set(
      sticker.id,
      setTimer(() => removeSticker(sticker.id), sticker.lifetimeMs),
    );
    return sticker;
  }

  function playTapTone(sticker: BabyTouchSticker): void {
    if (!settings.value.soundEnabled) {
      return;
    }

    audioContext ??= createAudioContext();
    if (audioContext === null) {
      return;
    }

    if (audioContext.state === "suspended" && audioContext.resume !== undefined) {
      void audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime;
    const frequency = 360 + ((sticker.hue + sticker.id * 31) % 260);
    const peak = Math.max(0.0001, (settings.value.volume / 100) * 0.055);

    oscillator.type = sticker.family === "bubble" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  }

  function openSettings(): void {
    settingsOpen.value = true;
  }

  function closeSettings(): void {
    settingsOpen.value = false;
  }

  function cancelParentHold(): void {
    if (parentHoldTimer !== null) {
      clearTimer(parentHoldTimer);
      parentHoldTimer = null;
    }
  }

  function maybeStartParentHold(): void {
    if (
      parentHoldTimer !== null ||
      ![...cornerPointers.values()].includes("left") ||
      ![...cornerPointers.values()].includes("right")
    ) {
      return;
    }
    parentHoldTimer = setTimer(() => {
      parentHoldTimer = null;
      cornerPointers.clear();
      openSettings();
    }, PARENT_HOLD_MS);
  }

  function handleParentCornerDown(pointerId: number, point: BabyTouchPoint): boolean {
    const corner = cornerForPoint(point);
    if (corner === null) {
      return false;
    }
    cornerPointers.set(pointerId, corner);
    maybeStartParentHold();
    return true;
  }

  function handleParentCornerUp(pointerId: number): void {
    if (!cornerPointers.has(pointerId)) {
      return;
    }
    cornerPointers.delete(pointerId);
    if (
      ![...cornerPointers.values()].includes("left") ||
      ![...cornerPointers.values()].includes("right")
    ) {
      cancelParentHold();
    }
  }

  function hasAudioContext(): boolean {
    return audioContext !== null;
  }

  onBeforeUnmount(() => {
    cancelParentHold();
    clearStickers();
  });

  return {
    activeCount,
    clearStickers,
    closeSettings,
    handleParentCornerDown,
    handleParentCornerUp,
    hasAudioContext,
    openSettings,
    playTapTone,
    reducedMotion,
    resetSettings,
    settings,
    settingsLabel,
    settingsOpen,
    spawnSticker,
    stickers,
    updateSettings,
  };
}
