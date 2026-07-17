import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SETTINGS_PHYSICAL_STORAGE_KEY } from "~/core/storage/preflight";

describe("syncPreflightTheme", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.rpColorScheme;
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("synchronizes an explicit persisted theme to Ropav", async () => {
    localStorage.setItem(
      SETTINGS_PHYSICAL_STORAGE_KEY,
      JSON.stringify({ data: { theme: "dark" } }),
    );

    await import("~/core/boot/syncPreflightTheme");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.rpColorScheme).toBe("dark");
  });

  it("sets both scheme attributes in the inline FOUC preflight", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(html.match(/document\.documentElement\.dataset\.theme\s*=/g)).toHaveLength(2);
    expect(html.match(/document\.documentElement\.dataset\.rpColorScheme\s*=/g)).toHaveLength(2);
  });

  it("synchronizes the resolved system theme to Ropav", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string): MediaQueryList =>
        ({
          media: query,
          matches: query === "(prefers-color-scheme: dark)",
          addEventListener: (): void => {},
          removeEventListener: (): void => {},
        }) as unknown as MediaQueryList,
    );

    await import("~/core/boot/syncPreflightTheme");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.rpColorScheme).toBe("dark");
  });
});
