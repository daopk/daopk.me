import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref, type Ref } from "vue";

import "fake-indexeddb/auto";

import BackgroundSection from "./BackgroundSection.vue";

import { builtinWallpapers } from "~/core/theme/wallpapers";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";
import type { SettingsState } from "~/types/settings";
import type { WallpaperUploadResult } from "~/types/wallpaper";
import { useWallpaperStore } from "~/core/wallpaper/WallpaperStore";
import { WALLPAPER_BLUR_SCALE, WALLPAPER_BLUR_VALUE } from "./background/useWallpaperBlur";

interface FakeKernel {
  kernel: Kernel;
  activeIdRef: Ref<string>;
  mobileActiveIdRef: Ref<string>;
  setSpy: ReturnType<typeof vi.fn>;
  setOverrideSpy: ReturnType<typeof vi.fn>;
  unsetOverrideSpy: ReturnType<typeof vi.fn>;
  overrides: Record<string, string>;
  fireTokensChanged: (keys: readonly string[]) => void;
  fireShellChanged: (shellId: "desktop" | "mobile") => void;
}

function makeFakeKernel(initial = builtinWallpapers[0]!.id): FakeKernel {
  const activeIdRef = ref<string>(initial);
  const mobileActiveIdRef = ref<string>(initial);

  const setSpy = vi.fn(<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void => {
    if (key === "desktopWallpaperActiveId") {
      activeIdRef.value = value as string;
    }
    if (key === "mobileWallpaperActiveId") {
      mobileActiveIdRef.value = value as string;
    }
  });

  const overrides: Record<string, string> = {};
  const tokensListeners = new Set<(payload: { keys: readonly string[] }) => void>();
  const shellListeners = new Set<(payload: { shellId: "desktop" | "mobile" }) => void>();

  const setOverrideSpy = vi.fn((cssVar: string, value: string) => {
    overrides[cssVar] = value;
    for (const listener of tokensListeners) {
      listener({ keys: [cssVar] });
    }
  });

  const unsetOverrideSpy = vi.fn((cssVar: string) => {
    delete overrides[cssVar];
    for (const listener of tokensListeners) {
      listener({ keys: [cssVar] });
    }
  });

  function fireTokensChanged(keys: readonly string[]): void {
    for (const listener of tokensListeners) {
      listener({ keys });
    }
  }

  function fireShellChanged(shellId: "desktop" | "mobile"): void {
    for (const listener of shellListeners) {
      listener({ shellId });
    }
  }

  const kernel = {
    settings: {
      use<K extends keyof SettingsState>(key: K) {
        if (key === "desktopWallpaperActiveId") {
          return activeIdRef as unknown as Ref<SettingsState[K]>;
        }
        if (key === "mobileWallpaperActiveId") {
          return mobileActiveIdRef as unknown as Ref<SettingsState[K]>;
        }
        return ref(undefined) as unknown as Ref<SettingsState[K]>;
      },
      get: vi.fn(),
      set: setSpy,
      reset: vi.fn(),
    },
    theme: {
      currentOverrides: () => ({ ...overrides }),
      setOverride: setOverrideSpy,
      unsetOverride: unsetOverrideSpy,
      setOverrides: vi.fn(),
      resetOverrides: vi.fn(),
      current: vi.fn(),
      setTheme: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      list: vi.fn(() => []),
    },
    wallpapers: {
      list: () => builtinWallpapers,
      get: (id: string) => builtinWallpapers.find((w) => w.id === id),
      register: vi.fn(() => () => undefined),
      unregister: vi.fn(),
    },
    events: {
      on(event: string, handler: (payload: { keys?: readonly string[] }) => void) {
        if (event === "tokens.changed") {
          tokensListeners.add(handler as (payload: { keys: readonly string[] }) => void);
          return (): boolean =>
            tokensListeners.delete(handler as (payload: { keys: readonly string[] }) => void);
        }
        if (event === "shell.changed") {
          shellListeners.add(handler as (payload: { shellId: "desktop" | "mobile" }) => void);
          return (): boolean =>
            shellListeners.delete(handler as (payload: { shellId: "desktop" | "mobile" }) => void);
        }
        return () => undefined;
      },
    },
  } as unknown as Kernel;

  return {
    kernel,
    activeIdRef,
    mobileActiveIdRef,
    setSpy,
    setOverrideSpy,
    unsetOverrideSpy,
    overrides,
    fireTokensChanged,
    fireShellChanged,
  };
}

function mountSection(fake: FakeKernel) {
  return mount(BackgroundSection, {
    attachTo: document.body,
    global: {
      provide: { [KernelInjectionKey as symbol]: fake.kernel },
    },
  });
}

describe("BackgroundSection (M2b.6)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    // happy-dom doesn't implement ResizeObserver; stub range geometry observers.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const s = useWallpaperStore();
    s.hydrate();
    await s.clear();
    s.dispose();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    try {
      useWallpaperStore().dispose();
    } catch {}
  });

  it("renders one tile per built-in wallpaper", () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    const tiles = wrapper.findAll(".background__tile");
    expect(tiles.length).toBe(builtinWallpapers.length);
    expect(tiles[0]?.text()).toContain("Liquid Glass");

    wrapper.unmount();
  });

  it("clicking a non-active tile writes through kernel.settings.set", async () => {
    const fake = makeFakeKernel("__none__");
    const wrapper = mountSection(fake);

    const tiles = wrapper.findAll(".background__tile");
    await tiles[0]?.trigger("click");

    expect(fake.setSpy).toHaveBeenCalledTimes(1);
    expect(fake.setSpy.mock.calls[0]?.[0]).toBe("desktopWallpaperActiveId");
    expect(fake.setSpy.mock.calls[0]?.[1]).toBe(builtinWallpapers[0]!.id);

    wrapper.unmount();
  });

  it("writes mobile wallpaper key when the active shell is mobile", async () => {
    const fake = makeFakeKernel("__desktop__");
    fake.mobileActiveIdRef.value = "__mobile__";
    const wrapper = mountSection(fake);

    fake.fireShellChanged("mobile");
    await nextTick();

    const tiles = wrapper.findAll(".background__tile");
    await tiles[0]?.trigger("click");

    expect(fake.setSpy).toHaveBeenCalledWith("mobileWallpaperActiveId", builtinWallpapers[0]!.id);

    wrapper.unmount();
  });

  it("re-clicking the active tile is a no-op (no facade call)", async () => {
    const fake = makeFakeKernel(builtinWallpapers[0]!.id);
    const wrapper = mountSection(fake);

    const activeTile = wrapper.findAll(".background__tile")[0];
    await activeTile?.trigger("click");

    expect(fake.setSpy).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("reactively updates the active tile when desktop wallpaper id changes externally", async () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    // Emulate an external setter writing a known built-in id (e.g. cross-tab sync).
    fake.activeIdRef.value = builtinWallpapers[0]!.id;
    await nextTick();

    const activeTile = wrapper
      .findAll(".background__tile")
      .find((tile) => tile.classes().includes("background__tile--active"));
    expect(activeTile?.text()).toContain("Liquid Glass");

    wrapper.unmount();
  });

  it("upload happy path: stores blob via WallpaperStore + sets active id (M2b.7)", async () => {
    const fake = makeFakeKernel();
    const store = useWallpaperStore();
    store.hydrate();

    const wrapper = mountSection(fake);

    const file = new File([new Uint8Array(256).fill(1)], "test.png", { type: "image/png" });
    const input = wrapper.find<HTMLInputElement>(".background__file-input");
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");

    await vi.waitFor(() => expect(store.list().length).toBe(1));
    expect(fake.setSpy).toHaveBeenCalledWith("desktopWallpaperActiveId", store.list()[0]?.id);

    wrapper.unmount();
  });

  it("rejects a concurrent drag-drop upload while one is in flight (polish C)", async () => {
    const fake = makeFakeKernel();
    const store = useWallpaperStore();
    store.hydrate();

    const wrapper = mountSection(fake);

    const file1 = new File([new Uint8Array(256).fill(1)], "first.png", { type: "image/png" });
    const input = wrapper.find<HTMLInputElement>(".background__file-input");
    Object.defineProperty(input.element, "files", { value: [file1], configurable: true });
    void input.trigger("change");
    await nextTick();

    const file2 = new File([new Uint8Array(256).fill(2)], "second.png", { type: "image/png" });
    const drop = new Event("drop") as DragEvent;
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [file2] },
      configurable: true,
    });
    Object.defineProperty(drop, "preventDefault", { value: () => {}, configurable: true });
    wrapper.find(".background").element.dispatchEvent(drop);
    await nextTick();

    const status = wrapper.find(".background__status");
    expect(status.exists()).toBe(true);
    expect(status.text()).toMatch(/already processing/i);

    await new Promise((resolve) => setTimeout(resolve, 30));
    await nextTick();

    expect(store.list().length).toBe(1);
    expect(store.list()[0]?.name).toMatch(/^first/);

    wrapper.unmount();
  });

  it("upload cap reject surfaces an error status row (M2b.7 Q12)", async () => {
    const fake = makeFakeKernel();
    const store = useWallpaperStore();
    store.hydrate();

    const wrapper = mountSection(fake);

    const file = new File([new Uint8Array(8)], "doc.pdf", { type: "application/pdf" });
    const input = wrapper.find<HTMLInputElement>(".background__file-input");
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");

    await new Promise((resolve) => setTimeout(resolve, 30));
    await nextTick();

    const status = wrapper.find(".background__status--error");
    expect(status.exists()).toBe(true);
    expect(store.list()).toEqual([]);

    wrapper.unmount();
  });

  it("replaces the old Legibility slider with a Blur switch", async () => {
    const fake = makeFakeKernel();

    const wrapper = mountSection(fake);
    await nextTick();

    expect(wrapper.text()).not.toContain("Legibility");
    const blurSwitch = wrapper.find<HTMLInputElement>('input[role="switch"]');
    expect(blurSwitch.exists()).toBe(true);
    expect(blurSwitch.element.checked).toBe(false);
    expect(wrapper.find("[data-testid='background-dim-slider']").exists()).toBe(false);

    wrapper.unmount();
  });

  it("clears a stale --wallpaper-dim override when Background settings mounts", async () => {
    const fake = makeFakeKernel();
    fake.overrides["--wallpaper-dim"] = "0.40";

    const wrapper = mountSection(fake);
    await nextTick();

    expect(fake.unsetOverrideSpy).toHaveBeenCalledWith("--wallpaper-dim");

    wrapper.unmount();
  });

  it("Blur switch writes the wallpaper blur tokens when toggled on", async () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);
    await nextTick();

    await wrapper.find<HTMLInputElement>('input[role="switch"]').trigger("click");
    await nextTick();

    expect(fake.setOverrideSpy).toHaveBeenCalledWith("--wallpaper-blur", WALLPAPER_BLUR_VALUE);
    expect(fake.setOverrideSpy).toHaveBeenCalledWith(
      "--wallpaper-blur-scale",
      WALLPAPER_BLUR_SCALE,
    );
    expect(wrapper.find<HTMLInputElement>('input[role="switch"]').element.checked).toBe(true);

    wrapper.unmount();
  });

  it("Blur switch unsets the wallpaper blur tokens when toggled off", async () => {
    const fake = makeFakeKernel();
    fake.overrides["--wallpaper-blur"] = WALLPAPER_BLUR_VALUE;
    fake.overrides["--wallpaper-blur-scale"] = WALLPAPER_BLUR_SCALE;

    const wrapper = mountSection(fake);
    await nextTick();

    expect(wrapper.find<HTMLInputElement>('input[role="switch"]').element.checked).toBe(true);

    await wrapper.find<HTMLInputElement>('input[role="switch"]').trigger("click");
    await nextTick();

    expect(fake.unsetOverrideSpy).toHaveBeenCalledWith("--wallpaper-blur");
    expect(fake.unsetOverrideSpy).toHaveBeenCalledWith("--wallpaper-blur-scale");
    expect(wrapper.find<HTMLInputElement>('input[role="switch"]').element.checked).toBe(false);

    wrapper.unmount();
  });

  it("preview applies blur to the wallpaper layer only", async () => {
    const fake = makeFakeKernel();
    fake.overrides["--wallpaper-blur"] = WALLPAPER_BLUR_VALUE;
    fake.overrides["--wallpaper-blur-scale"] = WALLPAPER_BLUR_SCALE;

    const wrapper = mountSection(fake);
    await nextTick();

    expect(wrapper.find(".background__preview").exists()).toBe(true);
    const wallpaper = wrapper.find<HTMLElement>(".background__stage-wallpaper");
    expect(wallpaper.exists()).toBe(true);
    expect(wallpaper.element.style.filter).toBe(`blur(${WALLPAPER_BLUR_VALUE})`);
    expect(wallpaper.element.style.transform).toBe(`scale(${WALLPAPER_BLUR_SCALE})`);

    wrapper.unmount();
  });

  it("Blur switch reacts to external --wallpaper-blur changes via tokens.changed", async () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);
    await nextTick();

    fake.overrides["--wallpaper-blur"] = WALLPAPER_BLUR_VALUE;
    fake.fireTokensChanged(["--wallpaper-blur"]);
    await nextTick();

    expect(wrapper.find<HTMLInputElement>('input[role="switch"]').element.checked).toBe(true);

    wrapper.unmount();
  });

  // --- Polish A — A11y / keyboard model -----------------------------------

  it("ArrowRight on a focused tile auto-activates the tile (polish A)", async () => {
    const fake = makeFakeKernel("__none__");
    const wrapper = mountSection(fake);

    const tiles = wrapper.findAll<HTMLButtonElement>(".background__tile");
    const first = tiles[0];
    expect(first).toBeDefined();
    expect(first?.attributes("tabindex")).toBe("0");

    await first?.trigger("keydown", { key: "ArrowRight" });

    expect(fake.setSpy).toHaveBeenCalledTimes(1);
    expect(fake.setSpy.mock.calls[0]?.[0]).toBe("desktopWallpaperActiveId");

    wrapper.unmount();
  });

  it("Home/End jump to first/last tile (polish A)", async () => {
    const fake = makeFakeKernel("__none__");
    const wrapper = mountSection(fake);

    const tiles = wrapper.findAll<HTMLButtonElement>(".background__tile");
    const lastIndex = tiles.length - 1;

    await tiles[0]?.trigger("keydown", { key: "End" });
    expect(fake.setSpy).toHaveBeenLastCalledWith("desktopWallpaperActiveId", expect.any(String));

    fake.setSpy.mockClear();
    await tiles[lastIndex]?.trigger("keydown", { key: "Home" });
    if (lastIndex === 0) {
      expect(fake.setSpy).not.toHaveBeenCalled();
    } else {
      expect(fake.setSpy).toHaveBeenLastCalledWith(
        "desktopWallpaperActiveId",
        builtinWallpapers[0]!.id,
      );
    }

    wrapper.unmount();
  });

  it("delete button is a sibling of the tile button, not nested (polish A)", () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);

    const tileButtons = wrapper.findAll(".background__tile");
    for (const tile of tileButtons) {
      expect(tile.find(".background__tile-remove").exists()).toBe(false);
    }

    wrapper.unmount();
  });

  it("Upload button signals aria-busy while processing (polish A)", async () => {
    const fake = makeFakeKernel();
    const store = useWallpaperStore();
    store.hydrate();
    let finishUpload!: () => void;
    vi.spyOn(store, "upload").mockReturnValue(
      new Promise<WallpaperUploadResult>((resolve) => {
        finishUpload = () =>
          resolve({ ok: false, reason: "io-error", message: "Finished test upload" });
      }),
    );

    const wrapper = mountSection(fake);

    const file = new File([new Uint8Array(256).fill(1)], "x.png", { type: "image/png" });
    const input = wrapper.find<HTMLInputElement>(".background__file-input");
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    void input.trigger("change");
    await nextTick();

    const uploadBtn = wrapper.find("#background-upload-trigger");
    expect(uploadBtn.attributes("aria-busy")).toBe("true");

    finishUpload();
    await flushPromises();

    expect(wrapper.find("#background-upload-trigger").attributes("aria-busy")).toBeUndefined();

    wrapper.unmount();
  });

  it("Blur switch is labelled by the Blur heading", async () => {
    const fake = makeFakeKernel();
    const wrapper = mountSection(fake);
    await nextTick();

    const switchRoot = wrapper.find("[role='switch']");
    expect(switchRoot.attributes("aria-labelledby")).toBe("background-blur-label");

    wrapper.unmount();
  });
});
