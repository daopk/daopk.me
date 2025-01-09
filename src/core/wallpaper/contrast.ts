import type { Wallpaper } from "~/core/theme/wallpapers";

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface WallpaperLabelContrast {
  readonly foreground: string;
  readonly shadow: string;
  readonly tone: "dark-text" | "light-text" | "fallback";
}

export interface WallpaperLabelContrastDeps {
  readonly sampleImageAverageRgb?: (src: string) => Promise<RgbColor | null>;
}

export const FALLBACK_WALLPAPER_LABEL_CONTRAST: WallpaperLabelContrast = Object.freeze({
  foreground: "var(--color-fg)",
  shadow: "none",
  tone: "fallback",
});

const LIGHT_TEXT = "rgb(255 255 255)";
const DARK_TEXT = "rgb(18 18 26)";
const LIGHT_TEXT_SHADOW = "0 1px 2px rgb(0 0 0 / 0.55), 0 0 10px rgb(0 0 0 / 0.32)";
const DARK_TEXT_SHADOW = "0 1px 2px rgb(255 255 255 / 0.72), 0 0 10px rgb(255 255 255 / 0.42)";
const LIGHT_BACKGROUND_THRESHOLD = 0.56;

export function wallpaperLabelContrastStyle(
  contrast: WallpaperLabelContrast,
): Record<string, string> {
  return {
    "--home-screen-label-fg": contrast.foreground,
    "--home-screen-label-shadow": contrast.shadow,
  };
}

export function labelContrastForRgb(rgb: RgbColor): WallpaperLabelContrast {
  const luminance = relativeLuminance(rgb);
  if (luminance > LIGHT_BACKGROUND_THRESHOLD) {
    return {
      foreground: DARK_TEXT,
      shadow: DARK_TEXT_SHADOW,
      tone: "dark-text",
    };
  }
  return {
    foreground: LIGHT_TEXT,
    shadow: LIGHT_TEXT_SHADOW,
    tone: "light-text",
  };
}

export async function resolveWallpaperLabelContrast(
  wallpaper: Wallpaper,
  deps: WallpaperLabelContrastDeps = {},
): Promise<WallpaperLabelContrast> {
  if (wallpaper.type === "solid") {
    const rgb = parseSolidColor(wallpaper.value);
    return rgb ? labelContrastForRgb(rgb) : FALLBACK_WALLPAPER_LABEL_CONTRAST;
  }

  if (wallpaper.type === "image") {
    try {
      const rgb = await (deps.sampleImageAverageRgb ?? sampleImageAverageRgb)(wallpaper.value);
      return rgb ? labelContrastForRgb(rgb) : FALLBACK_WALLPAPER_LABEL_CONTRAST;
    } catch {
      return FALLBACK_WALLPAPER_LABEL_CONTRAST;
    }
  }

  return FALLBACK_WALLPAPER_LABEL_CONTRAST;
}

export function parseSolidColor(value: string): RgbColor | null {
  const raw = value.trim().toLowerCase();
  if (raw.length === 0) {
    return null;
  }
  if (raw.startsWith("#")) {
    return parseHexColor(raw.slice(1));
  }
  if (raw === "black") {
    return { r: 0, g: 0, b: 0 };
  }
  if (raw === "white") {
    return { r: 255, g: 255, b: 255 };
  }

  const rgbMatch = raw.match(/^rgba?\((.*)\)$/);
  if (rgbMatch) {
    return parseRgbBody(rgbMatch[1] ?? "");
  }

  const hslMatch = raw.match(/^hsla?\((.*)\)$/);
  if (hslMatch) {
    return parseHslBody(hslMatch[1] ?? "");
  }

  return null;
}

function relativeLuminance(rgb: RgbColor): number {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function srgbToLinear(channel: number): number {
  const value = clamp(channel, 0, 255) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function parseHexColor(hex: string): RgbColor | null {
  if (!/^[\da-f]{3}$|^[\da-f]{6}$/i.test(hex)) {
    return null;
  }
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((ch) => `${ch}${ch}`)
          .join("")
      : hex;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function parseRgbBody(body: string): RgbColor | null {
  const parts = splitColorArgs(body);
  if (parts.length < 3) {
    return null;
  }
  const channels = parts.slice(0, 3).map(parseRgbChannel);
  if (channels.some((channel) => channel === null)) {
    return null;
  }
  return {
    r: channels[0] as number,
    g: channels[1] as number,
    b: channels[2] as number,
  };
}

function parseRgbChannel(raw: string): number | null {
  const value = raw.trim();
  if (value.endsWith("%")) {
    const percent = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(percent) ? Math.round(clamp(percent, 0, 100) * 2.55) : null;
  }
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? Math.round(clamp(numeric, 0, 255)) : null;
}

function parseHslBody(body: string): RgbColor | null {
  const parts = splitColorArgs(body);
  if (parts.length < 3) {
    return null;
  }
  const hue = Number.parseFloat(parts[0] ?? "");
  const saturation = parseUnitIntervalPercent(parts[1] ?? "");
  const lightness = parseUnitIntervalPercent(parts[2] ?? "");
  if (!Number.isFinite(hue) || saturation === null || lightness === null) {
    return null;
  }
  return hslToRgb(hue, saturation, lightness);
}

function parseUnitIntervalPercent(raw: string): number | null {
  const value = raw.trim();
  if (!value.endsWith("%")) {
    return null;
  }
  const numeric = Number.parseFloat(value.slice(0, -1));
  return Number.isFinite(numeric) ? clamp(numeric / 100, 0, 1) : null;
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbColor {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const normalizedHue = (((hue % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((normalizedHue % 2) - 1));
  const m = lightness - chroma / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (normalizedHue < 1) {
    r1 = chroma;
    g1 = x;
  } else if (normalizedHue < 2) {
    r1 = x;
    g1 = chroma;
  } else if (normalizedHue < 3) {
    g1 = chroma;
    b1 = x;
  } else if (normalizedHue < 4) {
    g1 = x;
    b1 = chroma;
  } else if (normalizedHue < 5) {
    r1 = x;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function splitColorArgs(body: string): string[] {
  return body
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function sampleImageAverageRgb(src: string): Promise<RgbColor | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return null;
  }

  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const size = 24;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let totalAlpha = 0;
  let r = 0;
  let g = 0;
  let b = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0;
    if (alpha < 8) {
      continue;
    }
    totalAlpha += alpha;
    r += (data[i] ?? 0) * alpha;
    g += (data[i + 1] ?? 0) * alpha;
    b += (data[i + 2] ?? 0) * alpha;
  }

  if (totalAlpha === 0) {
    return null;
  }

  return {
    r: Math.round(r / totalAlpha),
    g: Math.round(g / totalAlpha),
    b: Math.round(b / totalAlpha),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error("image-load-failed"));
    };
    image.src = src;
  });
}
