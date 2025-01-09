import { describe, expect, it, vi } from "vitest";

import {
  readResolvedThemePreflight,
  SETTINGS_PHYSICAL_STORAGE_KEY,
} from "~/core/storage/preflight";

describe("readResolvedThemePreflight", () => {
  it("uses settings:state raw key constant", () => {
    expect(SETTINGS_PHYSICAL_STORAGE_KEY).toBe("settings:state");
  });

  it("returns explicit light when persisted", () => {
    const raw = JSON.stringify({
      __v: 1,
      data: { theme: "light", bootCount: 0, shellOverride: null, reduceMotion: "auto" },
    });

    expect(readResolvedThemePreflight(raw)).toBe("light");
  });

  it("falls through to matchMedia dark for system pref", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("dark"),
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
    }));

    expect(readResolvedThemePreflight(null)).toBe("dark");

    vi.unstubAllGlobals();
  });
});
