import { afterEach, describe, expect, it, vi } from "vitest";

import { getSystemPreference, subscribeSystemPreference } from "~/core/theme/systemPreference";

describe("systemPreference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getSystemPreference maps matchMedia result", () => {
    vi.stubGlobal(
      "matchMedia",
      (q: string): MediaQueryList =>
        ({
          media: q,
          matches: true,
          addEventListener: (): void => {},
          removeEventListener: (): void => {},
        }) as unknown as MediaQueryList,
    );

    expect(getSystemPreference()).toBe("dark");
  });

  it("subscribeSystemPreference invokes callback and can be disposed", () => {
    const cb = vi.fn();

    const listeners: Array<() => void> = [];

    vi.stubGlobal(
      "matchMedia",
      (_q: string): MediaQueryList =>
        ({
          matches: false,
          addEventListener: (_ev: string, fn: () => void): void => {
            listeners.push(fn);
          },
          removeEventListener: (_ev: string, fn: () => void): void => {
            const i = listeners.indexOf(fn);

            if (i !== -1) {
              listeners.splice(i, 1);
            }
          },
        }) as unknown as MediaQueryList,
    );

    const dispose = subscribeSystemPreference(cb);

    expect(cb).toHaveBeenCalledWith("light");

    listeners[0]?.();

    expect(cb).toHaveBeenCalledTimes(2);

    expect(cb).toHaveBeenLastCalledWith("light");

    dispose();

    listeners[0]?.();

    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("getSystemPreference treats missing window as light", () => {
    vi.stubGlobal("window", undefined);

    expect(getSystemPreference()).toBe("light");
  });

  it("subscribeSystemPreference does not attach matchMedia without window", () => {
    vi.stubGlobal("window", undefined);

    const cb = vi.fn();

    const dispose = subscribeSystemPreference(cb);

    expect(cb).toHaveBeenCalledWith("light");

    dispose();
  });
});
