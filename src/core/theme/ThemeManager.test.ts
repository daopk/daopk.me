import { describe, expect, it, vi } from "vitest";

import { ThemeManager, type ThemeManagerDeps } from "~/core/theme/ThemeManager";
import type { ResolvedTheme } from "~/types/theme";

function deps(overrides?: Partial<ThemeManagerDeps>): ThemeManagerDeps {
  return {
    getPreference: (): "light" => "light",
    persist: (): void => {},
    getSystemPreference: (): "light" => "light",
    subscribeSystemPreference: (_cb): (() => void) => {
      return (): void => {};
    },
    ...overrides,
  };
}

describe("ThemeManager", () => {
  it("applyToDocument sets html data-theme", () => {
    const mgr = new ThemeManager(deps());
    mgr.applyToDocument("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("setTheme delegates to persist", () => {
    const persist = vi.fn();
    const mgr = new ThemeManager(
      deps({
        getPreference: (): "system" => "system",
        persist,
      }),
    );
    mgr.setTheme("dark");
    expect(persist).toHaveBeenCalledWith("dark");
  });

  it("current resolves system via getSystemPreference", () => {
    const mgr = new ThemeManager(
      deps({
        getPreference: (): "system" => "system",
        getSystemPreference: (): "dark" => "dark",
      }),
    );
    expect(mgr.current()).toBe("dark");
  });

  it("list exposes registered theme ids", () => {
    const mgr = new ThemeManager(deps());
    expect(mgr.list()).toEqual(["light", "dark"]);
  });

  it("subscribe invokes listener with current resolved theme", () => {
    const listener = vi.fn();
    const mgr = new ThemeManager(deps());
    mgr.subscribe(listener);
    expect(listener).toHaveBeenCalledWith("light");
  });

  it("subscribe disposer stops notifyResolved deliveries", () => {
    const listener = vi.fn();
    const mgr = new ThemeManager(deps());

    const stop = mgr.subscribe(listener);

    listener.mockClear();

    stop();

    mgr.notifyResolved("dark");

    expect(listener).not.toHaveBeenCalled();
  });

  it("dispose tears down injected system subscriber", () => {
    const unsub = vi.fn();

    const mgr = new ThemeManager(
      deps({
        subscribeSystemPreference: (_cb): (() => void) => unsub,
      }),
    );

    mgr.subscribeSystemPreference();

    mgr.dispose();

    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it("subscribeSystemPreference ignores drift when preference is fixed", () => {
    let pushSystem!: (resolved: ResolvedTheme) => void;

    const mgr = new ThemeManager(
      deps({
        getPreference: (): "dark" => "dark",

        subscribeSystemPreference: (cb): (() => void) => {
          pushSystem = cb;

          return (): void => {};
        },
      }),
    );

    const listener = vi.fn();

    mgr.subscribe(listener);

    mgr.applyToDocument("dark");

    mgr.subscribeSystemPreference();

    listener.mockClear();

    pushSystem?.("light");

    expect(listener).not.toHaveBeenCalled();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  describe("applyOverrides", () => {
    it("writes each entry to documentElement style", () => {
      const mgr = new ThemeManager(deps());

      mgr.applyOverrides({ "--color-accent": "#abcdef", "--radius-md": "12px" });

      expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#abcdef");
      expect(document.documentElement.style.getPropertyValue("--radius-md")).toBe("12px");

      mgr.dispose();
    });

    it("returns true on first apply, false on duplicate apply (dedupe)", () => {
      const mgr = new ThemeManager(deps());

      expect(mgr.applyOverrides({ "--color-accent": "#abcdef" })).toBe(true);
      expect(mgr.applyOverrides({ "--color-accent": "#abcdef" })).toBe(false);

      mgr.dispose();
    });

    it("removes keys absent from the new snapshot", () => {
      const mgr = new ThemeManager(deps());

      mgr.applyOverrides({ "--color-accent": "#abc", "--radius-md": "12px" });
      mgr.applyOverrides({ "--color-accent": "#abc" });

      expect(document.documentElement.style.getPropertyValue("--radius-md")).toBe("");
      expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#abc");

      mgr.dispose();
    });

    it("currentOverrides reflects the applied snapshot", () => {
      const mgr = new ThemeManager(deps());

      mgr.applyOverrides({ "--color-accent": "#abc", "--space-md": "16px" });

      expect(mgr.currentOverrides()).toEqual({
        "--color-accent": "#abc",
        "--space-md": "16px",
      });

      mgr.dispose();
    });

    it("dispose strips applied overrides from the document", () => {
      const mgr = new ThemeManager(deps());

      mgr.applyOverrides({ "--color-accent": "#abc" });
      expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#abc");

      mgr.dispose();

      expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("");
    });
  });

  it("subscribeSystemPreference reapplies when preference is system", () => {
    let push: ((r: "light" | "dark") => void) | undefined;

    const mgr = new ThemeManager(
      deps({
        getPreference: (): "system" => "system",
        getSystemPreference: (): "light" => "light",
        subscribeSystemPreference: (cb): (() => void) => {
          push = cb;

          return (): void => {
            push = undefined;
          };
        },
      }),
    );

    const listener = vi.fn();

    mgr.subscribe(listener);

    listener.mockClear();

    mgr.subscribeSystemPreference();

    push?.("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");

    expect(listener).toHaveBeenCalledWith("dark");
  });
});
