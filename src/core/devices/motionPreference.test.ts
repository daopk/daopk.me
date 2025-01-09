import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPrefersReducedMotion,
  subscribePrefersReducedMotion,
} from "~/core/devices/motionPreference";

interface MediaListener {
  cb: (event: MediaQueryListEvent) => void;
}

function createMatchMediaStub(initialMatch: boolean): {
  matchMedia: typeof window.matchMedia;
  fire(matches: boolean): void;
  listenerCount(): number;
  matchMediaCallCount(): number;
} {
  const listeners: MediaListener[] = [];
  let currentMatch = initialMatch;
  let calls = 0;

  const matchMedia = ((query: string): MediaQueryList => {
    calls += 1;
    return {
      media: query,
      get matches(): boolean {
        return currentMatch;
      },
      addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void): void => {
        listeners.push({ cb });
      },
      removeEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void): void => {
        const i = listeners.findIndex((l) => l.cb === cb);
        if (i !== -1) {
          listeners.splice(i, 1);
        }
      },
      addListener: (): void => {},
      removeListener: (): void => {},
      dispatchEvent: (): boolean => false,
      onchange: null,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  return {
    matchMedia,
    listenerCount: () => listeners.length,
    matchMediaCallCount: () => calls,
    fire(matches: boolean): void {
      currentMatch = matches;
      for (const { cb } of listeners) {
        cb({ matches } as MediaQueryListEvent);
      }
    },
  };
}

describe("motionPreference spine", () => {
  let stub: ReturnType<typeof createMatchMediaStub>;

  beforeEach(() => {
    stub = createMatchMediaStub(false);
    vi.stubGlobal("matchMedia", stub.matchMedia);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getPrefersReducedMotion reflects the current OS state", () => {
    expect(getPrefersReducedMotion()).toBe(false);

    stub = createMatchMediaStub(true);
    vi.stubGlobal("matchMedia", stub.matchMedia);

    expect(getPrefersReducedMotion()).toBe(true);
  });

  it("invokes the callback immediately on subscribe", () => {
    const cb = vi.fn<(reduced: boolean) => void>();
    const dispose = subscribePrefersReducedMotion(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(false);

    dispose();
  });

  it("multiplexes N subscribers onto a single MQL listener", () => {
    const a = vi.fn<(reduced: boolean) => void>();
    const b = vi.fn<(reduced: boolean) => void>();
    const c = vi.fn<(reduced: boolean) => void>();

    const da = subscribePrefersReducedMotion(a);
    const db = subscribePrefersReducedMotion(b);
    const dc = subscribePrefersReducedMotion(c);

    expect(stub.matchMediaCallCount()).toBeGreaterThanOrEqual(1);
    expect(stub.listenerCount()).toBe(1);

    stub.fire(true);

    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
    expect(c).toHaveBeenCalledTimes(2);
    expect(a).toHaveBeenLastCalledWith(true);
    expect(b).toHaveBeenLastCalledWith(true);
    expect(c).toHaveBeenLastCalledWith(true);

    da();
    db();
    dc();
  });

  it("tears down the MQL listener when the last subscriber leaves", () => {
    const a = vi.fn<(reduced: boolean) => void>();
    const b = vi.fn<(reduced: boolean) => void>();

    const da = subscribePrefersReducedMotion(a);
    const db = subscribePrefersReducedMotion(b);

    expect(stub.listenerCount()).toBe(1);

    da();
    expect(stub.listenerCount()).toBe(1);

    db();
    expect(stub.listenerCount()).toBe(0);
  });

  it("re-attaches the underlying MQL listener after a full unsubscribe → resubscribe cycle", () => {
    const a = vi.fn<(reduced: boolean) => void>();
    const da = subscribePrefersReducedMotion(a);
    da();

    expect(stub.listenerCount()).toBe(0);

    const b = vi.fn<(reduced: boolean) => void>();
    const db = subscribePrefersReducedMotion(b);

    expect(stub.listenerCount()).toBe(1);

    stub.fire(true);
    expect(b).toHaveBeenLastCalledWith(true);

    db();
  });
});
