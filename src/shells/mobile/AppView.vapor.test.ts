import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, inject, nextTick, onMounted, type Component } from "vue";

import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  type AppContext,
  type AppManifest,
} from "~/types/app";
import type { Kernel } from "~/types/kernel";

import AppView from "./AppView.vue";

const StubIcon = defineVaporComponent(() => document.createElement("svg"));
const StubApp = defineVaporComponent(() => document.createElement("div"));

function probeComponent(setup: () => void): Component {
  return defineVaporComponent(
    () => {
      setup();
      const element = document.createElement("div");
      element.className = "probe";
      return element;
    },
    { name: "Probe" },
  );
}

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: "alpha",
    name: "Alpha",
    icon: StubIcon,
    category: "system",
    component: () => Promise.resolve({ default: StubApp }),
    ...overrides,
  };
}

const lifecycleEmit = vi.fn();

let currentKernel: Pick<Kernel, "apps" | "lifecycleCoordinator">;

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "apps" | "lifecycleCoordinator"> {
    return currentKernel;
  },
}));

function makeKernel(
  manifests: readonly AppManifest[] = [manifest()],
): Pick<Kernel, "apps" | "lifecycleCoordinator"> {
  return {
    apps: {
      list: () => [...manifests],
      register: vi.fn(),
      launch: vi.fn(),
      unregister: vi.fn(),
    },
    lifecycleCoordinator: {
      register: vi.fn(),
      unregister: vi.fn(),
      emit: lifecycleEmit,
      on: vi.fn(() => () => undefined),
    },
  };
}

function makePointerEvent(type: string, init: { x?: number; y?: number } = {}): PointerEvent {
  const e = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(e, {
    pointerId: { value: 1 },
    pointerType: { value: "touch" },
    clientX: { value: init.x ?? 0 },
    clientY: { value: init.y ?? 0 },
  });
  return e;
}

describe("AppView", () => {
  beforeEach(() => {
    lifecycleEmit.mockClear();
    currentKernel = makeKernel();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  });

  afterEach(() => {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
  });

  it("renders the AppMount and a back button with an accessible name", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.find(".app-view__back").attributes("aria-label")).toBe("Back to home");
    expect(wrapper.find(".app-view__title").text()).toBe("Alpha");
    expect(wrapper.find("section.app-view").attributes("role")).toBe("main");
    expect(wrapper.find("section.app-view").attributes("data-manifest-id")).toBe("alpha");
    expect(wrapper.find("section.app-view").attributes("aria-current")).toBe("page");

    wrapper.unmount();
  });

  it("exposes a mobile app bottom comfort padding token", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    const body = wrapper.find(".app-view__body").element as HTMLElement;
    expect(body.style.getPropertyValue("--mobile-shell-app-bottom-padding")).toBe(
      "max(32px, var(--mobile-shell-safe-area-bottom, 0px))",
    );

    wrapper.unmount();
  });

  it("F1 — frame.args flows through AppMount into AppContext", async () => {
    const captured: { ctx: AppContext | null } = { ctx: null };

    const Probe = probeComponent(() => {
      captured.ctx = inject(AppContextInjectionKey) ?? null;
    });

    const probeManifest: AppManifest = {
      id: "alpha",
      name: "Alpha",
      icon: StubIcon,
      category: "system",
      component: () =>
        Promise.resolve(
          Object.assign(Object.create(null) as { default: Component }, {
            default: Probe,
            __esModule: true,
          }),
        ),
    };

    currentKernel = {
      apps: {
        list: () => [probeManifest],
        register: vi.fn(),
        launch: vi.fn(),
        unregister: vi.fn(),
      },
      lifecycleCoordinator: {
        register: vi.fn(),
        unregister: vi.fn(),
        emit: lifecycleEmit,
        on: vi.fn(() => () => undefined),
      },
    } as Pick<Kernel, "apps" | "lifecycleCoordinator">;

    const wrapper = mount(AppView, {
      props: {
        frame: {
          frameId: "f-args",
          handleId: "h-args",
          manifestId: "alpha",
          args: Object.freeze({ deepLinkTo: "settings/background" }),
        },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    expect(captured.ctx).toEqual({
      manifestId: "alpha",
      handleId: "h-args",
      args: { deepLinkTo: "settings/background" },
    });
    expect(Object.isFrozen(captured.ctx?.args)).toBe(true);

    wrapper.unmount();
  });

  it("lets hosted apps override the mobile chrome title and back action", async () => {
    const backHandler = vi.fn();

    const Probe = probeComponent(() => {
      const chrome = inject(AppChromeInjectionKey, null);

      onMounted(() => {
        chrome?.setTitle("Appearance");
        chrome?.setBackAction({
          ariaLabel: "Back to Settings",
          handler: backHandler,
        });
      });
    });

    const probeManifest: AppManifest = {
      id: "settings",
      name: "Settings",
      icon: StubIcon,
      category: "system",
      component: () =>
        Promise.resolve(
          Object.assign(Object.create(null) as { default: Component }, {
            default: Probe,
            __esModule: true,
          }),
        ),
    };

    currentKernel = {
      apps: {
        list: () => [probeManifest],
        register: vi.fn(),
        launch: vi.fn(),
        unregister: vi.fn(),
      },
      lifecycleCoordinator: {
        register: vi.fn(),
        unregister: vi.fn(),
        emit: lifecycleEmit,
        on: vi.fn(() => () => undefined),
      },
    } as Pick<Kernel, "apps" | "lifecycleCoordinator">;

    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-settings", handleId: "h-settings", manifestId: "settings" },
        title: "Settings",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.find(".app-view__title").text()).toBe("Appearance");
    expect(wrapper.find(".app-view__back").attributes("aria-label")).toBe("Back to Settings");
    expect(wrapper.emitted("title:frame")).toEqual([["h-settings", "settings", "Appearance"]]);

    await wrapper.find(".app-view__back").trigger("click");

    expect(backHandler).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("back")).toBeFalsy();

    wrapper.unmount();
  });

  it("hides the mobile titlebar from the manifest chrome default", async () => {
    currentKernel = makeKernel([manifest({ chrome: { mobile: { titlebar: "hidden" } } })]);

    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-fullscreen", handleId: "h-fullscreen", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.find(".app-view__chrome").exists()).toBe(false);
    expect(wrapper.find(".app-view__body").attributes("style")).toContain(
      "--mobile-shell-app-safe-area-top: var(--mobile-shell-safe-area-top, 0px)",
    );

    wrapper.unmount();
  });

  it("lets hosted apps override titlebar visibility at runtime", async () => {
    const Probe = probeComponent(() => {
      const chrome = inject(AppChromeInjectionKey, null);

      onMounted(() => {
        chrome?.setTitlebar?.("hidden");
      });
    });

    const probeManifest: AppManifest = {
      id: "alpha",
      name: "Alpha",
      icon: StubIcon,
      category: "system",
      component: () =>
        Promise.resolve(
          Object.assign(Object.create(null) as { default: Component }, {
            default: Probe,
            __esModule: true,
          }),
        ),
    };

    currentKernel = makeKernel([probeManifest]);

    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-runtime", handleId: "h-runtime", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.find(".app-view__chrome").exists()).toBe(false);

    wrapper.unmount();
  });

  it("exposes hide and close actions to hosted apps", async () => {
    const Probe = probeComponent(() => {
      const chrome = inject(AppChromeInjectionKey, null);

      onMounted(() => {
        chrome?.hide?.();
        chrome?.close?.();
      });
    });

    const probeManifest: AppManifest = {
      id: "alpha",
      name: "Alpha",
      icon: StubIcon,
      category: "system",
      component: () =>
        Promise.resolve(
          Object.assign(Object.create(null) as { default: Component }, {
            default: Probe,
            __esModule: true,
          }),
        ),
    };

    currentKernel = makeKernel([probeManifest]);

    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-actions", handleId: "h-actions", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.emitted("hide")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);

    wrapper.unmount();
  });

  it("emits `back` when the header back button is clicked", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();

    await wrapper.find(".app-view__back").trigger("click");

    expect(wrapper.emitted("back")).toBeTruthy();
    expect(wrapper.emitted("back")?.length).toBe(1);

    wrapper.unmount();
  });

  it("emits `back` when an edge swipe from the left edge crosses the distance threshold", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    const surface = wrapper.find("section.app-view").element as HTMLElement;

    surface.dispatchEvent(makePointerEvent("pointerdown", { x: 5, y: 400 }));
    surface.dispatchEvent(makePointerEvent("pointermove", { x: 200, y: 400 }));
    surface.dispatchEvent(makePointerEvent("pointerup", { x: 200, y: 400 }));

    expect(wrapper.emitted("back")).toBeTruthy();

    wrapper.unmount();
  });

  it("does not attach default edge-swipe back when mobile chrome disables it", async () => {
    currentKernel = makeKernel([manifest({ chrome: { mobile: { edgeSwipe: "disabled" } } })]);

    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-no-edge-swipe", handleId: "h-no-edge-swipe", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    const surface = wrapper.find("section.app-view").element as HTMLElement;

    surface.dispatchEvent(makePointerEvent("pointerdown", { x: 5, y: 400 }));
    surface.dispatchEvent(makePointerEvent("pointermove", { x: 200, y: 400 }));
    surface.dispatchEvent(makePointerEvent("pointerup", { x: 200, y: 400 }));

    expect(wrapper.emitted("back")).toBeFalsy();

    wrapper.unmount();
  });

  it("drops `aria-current` when isCurrent is false (background frame)", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: false,
      },
      attachTo: document.body,
    });

    await flushPromises();
    expect(wrapper.find("section.app-view").attributes("aria-current")).toBeUndefined();

    wrapper.unmount();
  });

  it("marks non-current frames `inert`, `aria-hidden`, and removes back button from tab order (C1)", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: false,
      },
      attachTo: document.body,
    });

    await flushPromises();

    const section = wrapper.find("section.app-view");
    expect(section.attributes("aria-hidden")).toBe("true");
    expect(section.attributes("inert")).toBeDefined();

    const back = wrapper.find(".app-view__back");
    expect(back.attributes("tabindex")).toBe("-1");

    wrapper.unmount();
  });

  it("keeps current frames tab-navigable (no inert/aria-hidden, back button focusable)", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();

    const section = wrapper.find("section.app-view");
    expect(section.attributes("aria-hidden")).toBeUndefined();
    expect(section.attributes("inert")).toBeUndefined();

    const back = wrapper.find(".app-view__back");
    expect(back.attributes("tabindex")).toBe("0");

    wrapper.unmount();
  });

  it("focuses the back button when isCurrent flips from false → true (I4 push-side)", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: false,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    const back = wrapper.find(".app-view__back").element as HTMLButtonElement;
    expect(document.activeElement).not.toBe(back);

    await wrapper.setProps({ isCurrent: true });
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(document.activeElement).toBe(back);

    wrapper.unmount();
  });

  it("does not emit `back` from edge-swipe when the frame is not current", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: false,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    const surface = wrapper.find("section.app-view").element as HTMLElement;
    surface.dispatchEvent(makePointerEvent("pointerdown", { x: 5, y: 400 }));
    surface.dispatchEvent(makePointerEvent("pointermove", { x: 200, y: 400 }));
    surface.dispatchEvent(makePointerEvent("pointerup", { x: 200, y: 400 }));

    expect(wrapper.emitted("back")).toBeFalsy();

    wrapper.unmount();
  });

  it("renders recents and hide buttons in the app header", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();

    const recents = wrapper.find(".app-view__recents");
    const hide = wrapper.find(".app-view__hide");
    expect(recents.exists()).toBe(true);
    expect(recents.attributes("aria-label")).toBe("Open recent apps");
    expect(hide.exists()).toBe(true);
    expect(hide.attributes("aria-label")).toBe("Hide app to home screen");

    wrapper.unmount();
  });

  it("emits `recents` when the recents button is clicked (M1.3.3 wiring)", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await wrapper.find(".app-view__recents").trigger("click");

    expect(wrapper.emitted("recents")).toBeTruthy();
    expect(wrapper.emitted("recents")?.length).toBe(1);

    wrapper.unmount();
  });

  it("emits `hide` when the hide button is clicked", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await wrapper.find(".app-view__hide").trigger("click");

    expect(wrapper.emitted("hide")).toBeTruthy();
    expect(wrapper.emitted("hide")?.length).toBe(1);

    wrapper.unmount();
  });

  it("M1.3.X-anim: applies `app-view--foreground` when isCurrent=true (no explicit isForegroundFrame)", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    const section = wrapper.find("section.app-view");
    expect(section.classes()).toContain("app-view--foreground");

    wrapper.unmount();
  });

  it("M1.3.X-anim: omits `app-view--foreground` when isCurrent=false (frame parked off-screen)", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: false,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    const section = wrapper.find("section.app-view");
    expect(section.classes()).not.toContain("app-view--foreground");

    wrapper.unmount();
  });

  it("M1.3.X-anim: isForegroundFrame overrides isCurrent for the slide class (switcher open over fg frame)", async () => {
    // The MobileShell passes isCurrent=false (a11y inert) + isForegroundFrame=true
    // The underlying AppView must NOT slide off-screen just because the
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: false,
        isForegroundFrame: true,
      },
      attachTo: document.body,
    });

    await flushPromises();
    await nextTick();

    const section = wrapper.find("section.app-view");
    // aria stays a11y-inert (switcher captures focus).
    expect(section.attributes("aria-current")).toBeUndefined();
    expect(section.attributes("inert")).toBeDefined();
    // …but the slide class stays on so the chrome doesn't translate away.
    expect(section.classes()).toContain("app-view--foreground");

    wrapper.unmount();
  });

  it("drops trailing header buttons from tab order when frame is not current (C1 a11y isolation)", async () => {
    const wrapper = mount(AppView, {
      props: {
        frame: { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
        title: "Alpha",
        isCurrent: false,
      },
      attachTo: document.body,
    });

    await flushPromises();

    expect(wrapper.find(".app-view__recents").attributes("tabindex")).toBe("-1");
    expect(wrapper.find(".app-view__hide").attributes("tabindex")).toBe("-1");

    wrapper.unmount();
  });
});
