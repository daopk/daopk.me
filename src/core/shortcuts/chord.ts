import { debugWarn } from "~/core/debug";

export interface ParsedChord {
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const MODIFIER_TOKENS = new Set([
  "meta",
  "cmd",
  "command",
  "ctrl",
  "control",
  "shift",
  "alt",
  "option",
]);

const KEY_ALIASES: Readonly<Record<string, string>> = {
  space: " ",
  spacebar: " ",
};

export function parseChord(binding: string): ParsedChord | null {
  if (typeof binding !== "string" || binding.trim().length === 0) {
    debugWarn("[shortcuts] parseChord: empty or non-string binding", { binding });
    return null;
  }

  const tokens = binding
    .split("+")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    debugWarn("[shortcuts] parseChord: no tokens after split", { binding });
    return null;
  }

  const chord: ParsedChord = {
    meta: false,
    ctrl: false,
    shift: false,
    alt: false,
    key: "",
  };

  let keyToken: string | null = null;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (MODIFIER_TOKENS.has(lower)) {
      switch (lower) {
        case "meta":
        case "cmd":
        case "command":
          chord.meta = true;
          break;
        case "ctrl":
        case "control":
          chord.ctrl = true;
          break;
        case "shift":
          chord.shift = true;
          break;
        case "alt":
        case "option":
          chord.alt = true;
          break;
      }
    } else {
      if (keyToken !== null) {
        debugWarn("[shortcuts] parseChord: multiple non-modifier tokens", {
          binding,
          tokens,
        });
        return null;
      }
      keyToken = lower;
    }
  }

  if (keyToken === null) {
    debugWarn("[shortcuts] parseChord: missing key token (modifiers only)", { binding });
    return null;
  }

  chord.key = KEY_ALIASES[keyToken] ?? keyToken;
  return chord;
}

export function matchesChord(chord: ParsedChord, event: KeyboardEvent): boolean {
  if (event.isComposing || event.repeat) {
    return false;
  }
  if (event.metaKey !== chord.meta) return false;
  if (event.ctrlKey !== chord.ctrl) return false;
  if (event.shiftKey !== chord.shift) return false;
  if (event.altKey !== chord.alt) return false;
  return event.key.toLowerCase() === chord.key;
}
