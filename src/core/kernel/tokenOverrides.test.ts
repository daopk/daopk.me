import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kernel } from "~/core/kernel";
import { profileKvNamespace } from "~/core/profile/storageScope";

const TOKEN_OVERRIDES_STORAGE_KEY = `${profileKvNamespace("test-profile", "tokens")}:state`;

describe("kernel token overrides — integration (M2b.1 Phase B)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.stubGlobal(
      "matchMedia",
      (q: string): MediaQueryList =>
        ({
          media: q,
          matches: false,
          addEventListener: (): void => {},
          removeEventListener: (): void => {},
        }) as MediaQueryList,
    );

    await kernel.init();
  });

  afterEach(() => {
    const leftovers = Object.keys(kernel.theme.currentOverrides());
    kernel.dispose();
    const root = document.documentElement;
    for (const key of leftovers) {
      root.style.removeProperty(key);
    }
    vi.unstubAllGlobals();
  });

  it("setOverride writes the value to documentElement style", async () => {
    kernel.theme.setOverride("--color-accent", "#abcdef");

    await new Promise<void>((r) => setTimeout(r, 0));

    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#abcdef");
    expect(kernel.theme.currentOverrides()["--color-accent"]).toBe("#abcdef");
  });

  it("REGRESSION: tokens.changed listener sees the post-apply snapshot via currentOverrides()", async () => {
    expect(kernel.theme.currentOverrides()["--color-accent"]).toBeUndefined();

    const seenAccents: Array<string | undefined> = [];
    const stop = kernel.events.on("tokens.changed", (payload) => {
      if (!payload.keys.includes("--color-accent")) {
        return;
      }
      // currentOverrides() MUST reflect the new value. The original
      // exactly this race surfacing in the UI.
      seenAccents.push(kernel.theme.currentOverrides()["--color-accent"]);
    });

    kernel.theme.setOverride("--color-accent", "#0284c7");
    await new Promise<void>((r) => setTimeout(r, 0));

    kernel.theme.setOverride("--color-accent", "#15803d");
    await new Promise<void>((r) => setTimeout(r, 0));

    stop();

    expect(seenAccents).toEqual(["#0284c7", "#15803d"]);
  });

  it("tokens.changed keys payload reflects only the keys that actually changed", async () => {
    const payloads: Array<{ keys: readonly string[]; source: string }> = [];
    const stop = kernel.events.on("tokens.changed", (p) => {
      payloads.push({ keys: [...p.keys], source: p.source });
    });

    kernel.theme.setOverrides({ "--color-accent": "#abc", "--radius-md": "12px" });
    await new Promise<void>((r) => setTimeout(r, 0));

    kernel.theme.setOverride("--color-accent", "#def"); // only one key changes
    await new Promise<void>((r) => setTimeout(r, 0));

    stop();

    expect(payloads[0]?.keys.sort()).toEqual(["--color-accent", "--radius-md"]);
    expect(payloads[0]?.source).toBe("local");

    expect(payloads[1]?.keys).toEqual(["--color-accent"]);
  });

  it("unsetOverride removes the property from documentElement style", async () => {
    kernel.theme.setOverride("--color-accent", "#abcdef");
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#abcdef");

    kernel.theme.unsetOverride("--color-accent");
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("");
    expect(kernel.theme.currentOverrides()["--color-accent"]).toBeUndefined();
  });

  it("cross-tab storage event repaints document AND emits tokens.changed { source: 'sync' }", async () => {
    // Start with a known local override so the cross-tab payload represents
    kernel.theme.setOverride("--color-accent", "#aaaaaa");
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#aaaaaa");

    // Simulate the sibling tab writing a new envelope to localStorage.
    // localStorage on any matching profile-scoped `storage` event — so
    const incoming = { __v: 1, data: { "--color-accent": "#bbbbbb", "--radius-md": "16px" } };
    localStorage.setItem(TOKEN_OVERRIDES_STORAGE_KEY, JSON.stringify(incoming));

    const payloads: Array<{ keys: readonly string[]; source: string }> = [];
    const stop = kernel.events.on("tokens.changed", (p) => {
      payloads.push({ keys: [...p.keys].sort(), source: p.source });
    });

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: TOKEN_OVERRIDES_STORAGE_KEY,
        newValue: JSON.stringify(incoming),
        oldValue: null,
        storageArea: localStorage,
      }),
    );

    await new Promise<void>((r) => setTimeout(r, 0));

    stop();

    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#bbbbbb");
    expect(document.documentElement.style.getPropertyValue("--radius-md")).toBe("16px");

    // At least one `source: "sync"` payload covering both keys must appear.
    const syncPayload = payloads.find((p) => p.source === "sync");
    expect(syncPayload).toBeDefined();
    expect(syncPayload?.keys).toEqual(["--color-accent", "--radius-md"]);
  });

  it("hydrate restores persisted overrides and paints the document on init", async () => {
    // localStorage payload in place.
    kernel.dispose();

    localStorage.setItem(
      TOKEN_OVERRIDES_STORAGE_KEY,
      JSON.stringify({ __v: 1, data: { "--color-accent": "#15803d" } }),
    );

    setActivePinia(createPinia());
    await kernel.init();

    expect(kernel.theme.currentOverrides()["--color-accent"]).toBe("#15803d");
    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#15803d");
  });
});
