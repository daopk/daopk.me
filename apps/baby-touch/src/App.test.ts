import { AppChromeInjectionKey, type AppChromeController } from "@daopk/sdk";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import BabyTouchApp from "./App.vue";
import { babyTouchStickerCategories } from "./babyTouchStickerCatalog";
import { PARENT_HOLD_MS } from "./babyTouchTiming";

function testRect(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function setElementRect(element: Element, width: number, height: number): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => testRect(width, height),
  });
}

function setSurfaceRect(wrapper: VueWrapper, width = 200, height = 100): void {
  const surface = wrapper.find('[data-testid="baby-touch-surface"]');
  setElementRect(surface.element, width, height);
}

function setOrientationViewportRect(wrapper: VueWrapper, width: number, height: number): void {
  const viewport = wrapper.find('[data-testid="baby-touch-orientation-viewport"]');
  setElementRect(viewport.element, width, height);
}

function setHomeSliderRect(wrapper: VueWrapper, width = 260, height = 48): void {
  const slider = wrapper.find('[data-testid="baby-touch-home-slider"]');
  setElementRect(slider.element, width, height);
}

async function startGameFromBackground(wrapper: VueWrapper, index = 0): Promise<void> {
  const backgrounds = wrapper.findAll('[data-testid="baby-touch-background-option"]');
  await backgrounds[index]!.trigger("click");
  await nextTick();
}

function appChromeController(): AppChromeController {
  return {
    setTitle: vi.fn(),
    setBackAction: vi.fn(),
    setTitlebar: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
  };
}

describe("Baby Touch App", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
    delete document.documentElement.dataset.shell;
    localStorage.clear();
  });

  it("renders the streamlined home background picker first", () => {
    const wrapper = mount(BabyTouchApp);

    expect(wrapper.find('[data-testid="baby-touch-home"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="baby-touch-open-gallery"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="baby-touch-hide-app"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="baby-touch-background-option"]')).toHaveLength(4);
    expect(wrapper.find('[data-testid="baby-touch-settings"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="baby-touch-start-game"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="baby-touch-close-app"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="baby-touch-surface"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="baby-touch-sticker"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("opens a categorized sticker gallery from the home screen", async () => {
    const wrapper = mount(BabyTouchApp);
    const expectedStickerCount = babyTouchStickerCategories.reduce(
      (count, category) => count + category.stickers.length,
      0,
    );

    await wrapper.find('[data-testid="baby-touch-open-gallery"]').trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="baby-touch-home"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="baby-touch-gallery"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="baby-touch-gallery-category"]')).toHaveLength(
      babyTouchStickerCategories.length,
    );
    expect(wrapper.findAll('[data-testid="baby-touch-gallery-sticker"]')).toHaveLength(
      expectedStickerCount,
    );
    expect(wrapper.text()).toContain("Animals");
    expect(wrapper.text()).toContain("Bear");
    expect(wrapper.text()).not.toContain("Shapes");

    await wrapper.find('[data-testid="baby-touch-gallery-back"]').trigger("click");
    await nextTick();

    expect(wrapper.find('[data-testid="baby-touch-home"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="baby-touch-gallery"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("creates a sticker at normalized pointer coordinates", async () => {
    const wrapper = mount(BabyTouchApp);
    await startGameFromBackground(wrapper);
    setSurfaceRect(wrapper);

    await wrapper.find('[data-testid="baby-touch-surface"]').trigger("pointerdown", {
      clientX: 50,
      clientY: 25,
      pointerId: 1,
    });

    const sticker = wrapper.find('[data-testid="baby-touch-sticker"]');
    expect(sticker.exists()).toBe(true);
    expect(sticker.attributes("style")).toContain("--baby-touch-x: 25%");
    expect(sticker.attributes("style")).toContain("--baby-touch-y: 25%");
    expect(sticker.attributes("style")).toContain("--baby-touch-travel-x:");
    expect(sticker.attributes("style")).toContain("--baby-touch-travel-y:");

    wrapper.unmount();
  });

  it("force-renders landscape-right in a portrait mobile shell body", async () => {
    document.documentElement.dataset.shell = "mobile";
    const wrapper = mount(BabyTouchApp, { attachTo: document.body });
    setOrientationViewportRect(wrapper, 390, 680);

    window.dispatchEvent(new Event("resize"));
    await nextTick();

    const viewport = wrapper.find('[data-testid="baby-touch-orientation-viewport"]');
    expect(wrapper.classes()).toContain("baby-touch--landscape-right");
    expect(viewport.attributes("data-orientation-mode")).toBe("landscape-right");
    expect(
      (viewport.element as HTMLElement).style.getPropertyValue("--baby-touch-viewport-inline-size"),
    ).toBe("390px");
    expect(
      (viewport.element as HTMLElement).style.getPropertyValue("--baby-touch-viewport-block-size"),
    ).toBe("680px");

    wrapper.unmount();
  });

  it("maps forced landscape-right taps to logical sticker coordinates", async () => {
    document.documentElement.dataset.shell = "mobile";
    const wrapper = mount(BabyTouchApp, { attachTo: document.body });
    setOrientationViewportRect(wrapper, 100, 200);
    window.dispatchEvent(new Event("resize"));
    await nextTick();

    await startGameFromBackground(wrapper);
    setSurfaceRect(wrapper, 100, 200);

    await wrapper.find('[data-testid="baby-touch-surface"]').trigger("pointerdown", {
      clientX: 25,
      clientY: 50,
      pointerId: 1,
    });

    const sticker = wrapper.find('[data-testid="baby-touch-sticker"]');
    expect(sticker.exists()).toBe(true);
    expect(sticker.attributes("style")).toContain("--baby-touch-x: 25%");
    expect(sticker.attributes("style")).toContain("--baby-touch-y: 75%");

    wrapper.unmount();
  });

  it("returns home as soon as the game home slider is dragged far enough", async () => {
    const wrapper = mount(BabyTouchApp, { attachTo: document.body });
    await startGameFromBackground(wrapper);
    setHomeSliderRect(wrapper);

    const slider = wrapper.find('[data-testid="baby-touch-home-slider"]');
    const thumb = wrapper.find('[data-testid="baby-touch-home-slider-thumb"]');
    expect(slider.classes()).not.toContain("baby-touch__home-slider--active");

    await thumb.trigger("pointerdown", { clientX: 24, clientY: 24, pointerId: 1 });
    await nextTick();
    expect(slider.classes()).toContain("baby-touch__home-slider--active");
    expect(thumb.text()).toBe("→");

    await thumb.trigger("pointermove", { clientX: 74, clientY: 24, pointerId: 1 });
    await thumb.trigger("pointerup", { clientX: 74, clientY: 24, pointerId: 1 });
    await nextTick();

    expect(wrapper.find('[data-testid="baby-touch-surface"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="baby-touch-home"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="baby-touch-sticker"]').exists()).toBe(false);
    expect(slider.classes()).not.toContain("baby-touch__home-slider--active");
    expect(thumb.text()).toBe("X");

    await thumb.trigger("pointerdown", { clientX: 24, clientY: 24, pointerId: 2 });
    await thumb.trigger("pointermove", { clientX: 210, clientY: 24, pointerId: 2 });
    await nextTick();

    expect(wrapper.find('[data-testid="baby-touch-home"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="baby-touch-surface"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("accepts a vertical slide when the home slider is visually rotated", async () => {
    const wrapper = mount(BabyTouchApp, { attachTo: document.body });
    await startGameFromBackground(wrapper);
    setHomeSliderRect(wrapper, 48, 260);

    const thumb = wrapper.find('[data-testid="baby-touch-home-slider-thumb"]');
    await thumb.trigger("pointerdown", { clientX: 24, clientY: 24, pointerId: 1 });
    await thumb.trigger("pointermove", { clientX: 24, clientY: 210, pointerId: 1 });
    await nextTick();

    expect(wrapper.find('[data-testid="baby-touch-home"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="baby-touch-surface"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("starts the game immediately when a background is chosen", async () => {
    const controller = appChromeController();
    const wrapper = mount(BabyTouchApp, {
      attachTo: document.body,
      global: {
        provide: { [AppChromeInjectionKey as symbol]: controller },
      },
    });

    await startGameFromBackground(wrapper, 2);

    expect(wrapper.find('[data-testid="baby-touch-home"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="baby-touch-surface"]').exists()).toBe(true);
    expect(wrapper.attributes("class")).toContain("baby-touch--background-candy");
    expect(controller.setTitlebar).not.toHaveBeenCalledWith("visible");
    expect(controller.setTitlebar).toHaveBeenLastCalledWith("hidden");

    setHomeSliderRect(wrapper);
    const thumb = wrapper.find('[data-testid="baby-touch-home-slider-thumb"]');
    await thumb.trigger("pointerdown", { clientX: 24, clientY: 24, pointerId: 1 });
    await thumb.trigger("pointermove", { clientX: 210, clientY: 24, pointerId: 1 });
    await nextTick();

    expect(wrapper.find('[data-testid="baby-touch-home"]').exists()).toBe(true);
    expect(wrapper.attributes("class")).not.toContain("baby-touch--background-candy");

    wrapper.unmount();
  });

  it("returns home after the parent corner hold", async () => {
    const controller = appChromeController();
    const wrapper = mount(BabyTouchApp, {
      attachTo: document.body,
      global: {
        provide: { [AppChromeInjectionKey as symbol]: controller },
      },
    });
    await startGameFromBackground(wrapper);
    setSurfaceRect(wrapper);

    await wrapper.find('[data-testid="baby-touch-surface"]').trigger("pointerdown", {
      clientX: 16,
      clientY: 8,
      pointerId: 1,
    });
    await wrapper.find('[data-testid="baby-touch-surface"]').trigger("pointerdown", {
      clientX: 184,
      clientY: 8,
      pointerId: 2,
    });
    await vi.advanceTimersByTimeAsync(PARENT_HOLD_MS);
    await nextTick();

    expect(wrapper.find('[data-testid="baby-touch-home"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="baby-touch-surface"]').exists()).toBe(false);
    expect(controller.setTitlebar).toHaveBeenLastCalledWith("hidden");

    wrapper.unmount();
  });

  it("wires the custom home hide action to app chrome", async () => {
    const controller = appChromeController();
    const wrapper = mount(BabyTouchApp, {
      attachTo: document.body,
      global: {
        provide: { [AppChromeInjectionKey as symbol]: controller },
      },
    });
    const hideButton = wrapper.find('[data-testid="baby-touch-hide-app"]');

    expect(hideButton.exists()).toBe(true);
    await hideButton.trigger("click");

    expect(controller.hide).toHaveBeenCalledTimes(1);
    expect(controller.close).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
