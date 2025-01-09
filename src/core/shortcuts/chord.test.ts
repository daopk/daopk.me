import { describe, expect, it, vi } from "vitest";

import { matchesChord, parseChord, type ParsedChord } from "./chord";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function event(
  init: Partial<KeyboardEvent> & { key: string; isComposing?: boolean; repeat?: boolean },
): KeyboardEvent {
  return {
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    isComposing: init.isComposing ?? false,
    repeat: init.repeat ?? false,
    key: init.key,
  } as KeyboardEvent;
}

describe("parseChord", () => {
  it("parses a single-key chord with no modifiers", () => {
    expect(parseChord("Escape")).toEqual<ParsedChord>({
      meta: false,
      ctrl: false,
      shift: false,
      alt: false,
      key: "escape",
    });
  });

  it("parses Meta+K", () => {
    expect(parseChord("Meta+K")).toEqual<ParsedChord>({
      meta: true,
      ctrl: false,
      shift: false,
      alt: false,
      key: "k",
    });
  });

  it("parses Ctrl+Shift+P with mixed casing and whitespace", () => {
    expect(parseChord("  ctrl + Shift + p  ")).toEqual<ParsedChord>({
      meta: false,
      ctrl: true,
      shift: true,
      alt: false,
      key: "p",
    });
  });

  it("parses every modifier alias (Cmd, Command, Control, Option)", () => {
    expect(parseChord("Cmd+K")?.meta).toBe(true);
    expect(parseChord("Command+K")?.meta).toBe(true);
    expect(parseChord("Control+K")?.ctrl).toBe(true);
    expect(parseChord("Option+K")?.alt).toBe(true);
  });

  it("parses arrow keys / named keys", () => {
    expect(parseChord("ArrowUp")?.key).toBe("arrowup");
    expect(parseChord("Meta+Enter")?.key).toBe("enter");
  });

  it("returns null for empty / whitespace bindings", () => {
    expect(parseChord("")).toBeNull();
    expect(parseChord("   ")).toBeNull();
    expect(parseChord("+")).toBeNull();
  });

  it("returns null for non-string inputs", () => {
    expect(parseChord(undefined as unknown as string)).toBeNull();
    expect(parseChord(null as unknown as string)).toBeNull();
  });

  it("returns null for modifier-only bindings", () => {
    expect(parseChord("Meta")).toBeNull();
    expect(parseChord("Meta+Shift")).toBeNull();
  });

  it("returns null when the binding has multiple non-modifier tokens (ambiguous)", () => {
    expect(parseChord("Meta+K+L")).toBeNull();
  });

  it("normalizes Space / Spacebar to the literal space character (KeyboardEvent.key=' ')", () => {
    expect(parseChord("Space")?.key).toBe(" ");
    expect(parseChord("Spacebar")?.key).toBe(" ");
    expect(parseChord("Meta+Space")).toEqual<ParsedChord>({
      meta: true,
      ctrl: false,
      shift: false,
      alt: false,
      key: " ",
    });
  });

  it("parses digit and function keys (no aliasing needed — KeyboardEvent.key is 1:1)", () => {
    expect(parseChord("Meta+3")?.key).toBe("3");
    expect(parseChord("F5")?.key).toBe("f5");
    expect(parseChord("Ctrl+F12")?.key).toBe("f12");
  });
});

describe("matchesChord", () => {
  const metaK = parseChord("Meta+K")!;

  it("matches when modifiers + key align exactly", () => {
    expect(matchesChord(metaK, event({ metaKey: true, key: "k" }))).toBe(true);
  });

  it("rejects when an unrequested modifier is held", () => {
    expect(matchesChord(metaK, event({ metaKey: true, shiftKey: true, key: "k" }))).toBe(false);
  });

  it("rejects when a required modifier is missing", () => {
    expect(matchesChord(metaK, event({ key: "k" }))).toBe(false);
  });

  it("rejects when the key differs", () => {
    expect(matchesChord(metaK, event({ metaKey: true, key: "j" }))).toBe(false);
  });

  it("is case-insensitive on event.key (capslock / shifted casing)", () => {
    expect(matchesChord(metaK, event({ metaKey: true, key: "K" }))).toBe(true);
  });

  it("rejects events while IME is composing", () => {
    expect(matchesChord(metaK, event({ metaKey: true, key: "k", isComposing: true }))).toBe(false);
  });

  it("rejects auto-repeat events (chord shortcuts fire once per press)", () => {
    expect(matchesChord(metaK, event({ metaKey: true, key: "k", repeat: true }))).toBe(false);
  });

  it("matches modifier-aware named keys", () => {
    const ctrlEnter = parseChord("Ctrl+Enter")!;
    expect(matchesChord(ctrlEnter, event({ ctrlKey: true, key: "Enter" }))).toBe(true);
    expect(matchesChord(ctrlEnter, event({ key: "Enter" }))).toBe(false);
  });

  it("matches the space bar via the Space alias", () => {
    const metaSpace = parseChord("Meta+Space")!;
    expect(matchesChord(metaSpace, event({ metaKey: true, key: " " }))).toBe(true);
    expect(matchesChord(metaSpace, event({ metaKey: true, key: "space" }))).toBe(false);
  });

  it("matches function keys regardless of casing reported by the browser", () => {
    const f5 = parseChord("F5")!;
    expect(matchesChord(f5, event({ key: "F5" }))).toBe(true);
    expect(matchesChord(f5, event({ key: "f5" }))).toBe(true);
  });
});
