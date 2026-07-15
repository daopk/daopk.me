import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";

import { kernel } from "~/core/kernel";

describe("kernel reactive effects", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal(
      "matchMedia",
      (query: string): MediaQueryList =>
        ({
          media: query,
          matches: false,
          addEventListener: (): void => {},
          removeEventListener: (): void => {},
        }) as unknown as MediaQueryList,
    );
  });

  afterEach(() => {
    kernel.dispose();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
  });

  it("keeps live theme updates after the scope that started the kernel is disposed", async () => {
    const bootScope = effectScope();
    const init = bootScope.run(() => kernel.init());

    expect(init).toBeDefined();
    await init;

    bootScope.stop();
    kernel.theme.setTheme("dark");
    await nextTick();

    expect(document.documentElement.dataset.theme).toBe("dark");

    kernel.theme.setOverride("--color-accent", "#0284c7");
    await nextTick();

    expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#0284c7");
  });
});
