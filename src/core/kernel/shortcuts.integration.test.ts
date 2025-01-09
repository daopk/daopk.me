import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kernel } from "./index";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function press(
  init: KeyboardEventInit & { key: string; isComposing?: boolean; repeat?: boolean },
): KeyboardEvent {
  const evt = new KeyboardEvent("keydown", init);
  if (init.isComposing) {
    Object.defineProperty(evt, "isComposing", { value: true });
  }
  if (init.repeat) {
    Object.defineProperty(evt, "repeat", { value: true });
  }
  window.dispatchEvent(evt);
  return evt;
}

describe("kernel.shortcuts.register (chord-aware)", () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    dispose = null;
  });

  afterEach(() => {
    if (dispose) {
      dispose();
      dispose = null;
    }
  });

  it("invokes the handler when a matching chord fires on window", () => {
    const handler = vi.fn();
    dispose = kernel.shortcuts.register("Meta+K", handler);

    press({ key: "k", metaKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT invoke the handler for an unrelated key", () => {
    const handler = vi.fn();
    dispose = kernel.shortcuts.register("Meta+K", handler);

    press({ key: "j", metaKey: true });
    press({ key: "k" }); // missing Meta

    expect(handler).not.toHaveBeenCalled();
  });

  it("does NOT invoke the handler when an extra modifier is held", () => {
    const handler = vi.fn();
    dispose = kernel.shortcuts.register("Meta+K", handler);

    press({ key: "k", metaKey: true, shiftKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it("disposer removes the listener", () => {
    const handler = vi.fn();
    dispose = kernel.shortcuts.register("Meta+K", handler);
    dispose();
    dispose = null;

    press({ key: "k", metaKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it("malformed binding installs a never-matching listener (no throw, no fire)", () => {
    const handler = vi.fn();
    dispose = kernel.shortcuts.register("", handler);

    press({ key: "k", metaKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it("supports multiple bindings for the same logical command (Meta+K AND Ctrl+K)", () => {
    const handler = vi.fn();
    const off1 = kernel.shortcuts.register("Meta+K", handler);
    const off2 = kernel.shortcuts.register("Ctrl+K", handler);

    press({ key: "k", metaKey: true });
    press({ key: "k", ctrlKey: true });

    expect(handler).toHaveBeenCalledTimes(2);

    off1();
    off2();
  });
});
