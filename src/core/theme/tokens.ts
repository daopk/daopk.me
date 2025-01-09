export const THEMES = {
  light: {
    bg: "#f8f8fc",
    fg: "#12121a",
    accent: "#5a2d82",
    accentSheen: "#b794d6",
  },
  dark: {
    bg: "#09090f",
    fg: "#f4f5ff",
    accent: "#5a2d82",
    accentSheen: "#b794d6",
  },
} as const;

export type ThemeName = keyof typeof THEMES;

export const TOKEN_KEYS = [
  ["--color-accent", "accent"],
  ["--color-bg", "bg"],
  ["--color-fg", "fg"],
  ["--color-accent-sheen", "accentSheen"],
] as const;
