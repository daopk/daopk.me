import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, type Component } from "vue";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import HomeScreen from "./HomeScreen.vue";

vi.mock("~/composables/useReducedMotion", () => ({
  useReducedMotion: () => ({ reduced: { value: false } }),
}));

const StubIcon = defineComponent({ template: "<svg />" });

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: "alpha",
    name: "Alpha",
    icon: StubIcon as Component,
    category: "system",
    component: () => Promise.resolve({ default: defineComponent({ template: "<div />" }) }),
    ...overrides,
  };
}

let currentKernel: Pick<Kernel, "apps" | "widgets" | "events">;

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "apps" | "widgets" | "events"> {
    return currentKernel;
  },
}));

function makeKernel(manifests: AppManifest[]): Pick<Kernel, "apps" | "widgets" | "events"> {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const emit = vi.fn((event: string, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) {
      listener(payload);
    }
  });

  return {
    apps: {
      list: () => manifests,
      register: vi.fn(),
      launch: vi.fn(),
      unregister: vi.fn(),
    },
    widgets: {
      list: () => [],
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
    } as unknown as Kernel["widgets"],
    events: {
      on: vi.fn((event: string, listener: (payload: unknown) => void) => {
        const bucket = listeners.get(event) ?? new Set<(payload: unknown) => void>();
        bucket.add(listener);
        listeners.set(event, bucket);
        return () => bucket.delete(listener);
      }),
      emit,
    } as unknown as Kernel["events"],
  };
}

describe("HomeScreen multi-page (M1.4)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
    currentKernel = makeKernel([]);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("renders the `<main>` landmark + page indicator with 2 dots", () => {
    const wrapper = mount(HomeScreen, {
      props: { recentsAvailable: false },
    });

    const main = wrapper.find("main.home-screen");
    expect(main.exists()).toBe(true);
    expect(main.attributes("aria-label")).toBe("Home screen");
    expect(main.find("h1").text()).toBe("Home");

    expect(wrapper.findAll(".home-page-indicator__dot").length).toBe(2);
  });

  it("renders icon-grid manifests on page 1 via HomeIconPage", () => {
    currentKernel = makeKernel([
      manifest({ id: "alpha", name: "Alpha" }),
      manifest({ id: "beta", name: "Beta" }),
    ]);

    const wrapper = mount(HomeScreen, {
      props: { recentsAvailable: false },
    });

    const icons = wrapper.findAll("button.home-icon");
    expect(icons.length).toBe(2);
    expect(icons[0].attributes("data-manifest-id")).toBe("alpha");
    expect(icons[1].attributes("data-manifest-id")).toBe("beta");
    expect(wrapper.find(".home-icon-page__grid").element.tagName).toBe("DIV");
    expect(wrapper.find(".home-icon-page__grid").attributes("aria-label")).toBeUndefined();
  });

  it("refreshes the mobile icon grid when an app registers after mount", async () => {
    const manifests = [manifest({ id: "alpha", name: "Alpha" })];
    currentKernel = makeKernel(manifests);

    const wrapper = mount(HomeScreen, {
      props: { recentsAvailable: false },
    });

    expect(
      wrapper.findAll("button.home-icon").map((icon) => icon.attributes("data-manifest-id")),
    ).toEqual(["alpha"]);

    manifests.push(manifest({ id: "baby-touch", name: "Baby Touch" }));
    currentKernel.events.emit("app.registered", { id: "baby-touch" });
    await nextTick();

    expect(
      wrapper.findAll("button.home-icon").map((icon) => icon.attributes("data-manifest-id")),
    ).toEqual(["alpha", "baby-touch"]);
  });

  it("hides private and hidden manifests on page 1", () => {
    currentKernel = makeKernel([
      manifest({ id: "alpha" }),
      manifest({ id: "_template" }),
      manifest({ id: "trash", hidden: true }),
      manifest({ id: "beta" }),
    ]);

    const wrapper = mount(HomeScreen, {
      props: { recentsAvailable: false },
    });

    const ids = wrapper
      .findAll("button.home-icon")
      .map((icon) => icon.attributes("data-manifest-id"));
    expect(ids).toEqual(["alpha", "beta"]);
  });

  it("renders the icon-grid empty state when no launcher-visible manifests exist", () => {
    currentKernel = makeKernel([manifest({ id: "_template" })]);

    const wrapper = mount(HomeScreen, {
      props: { recentsAvailable: false },
    });

    expect(wrapper.findAll("button.home-icon").length).toBe(0);
    expect(wrapper.find(".home-icon-page__empty").exists()).toBe(true);
  });

  it("emits `launch` with the manifest id when an icon is activated", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" })]);

    const wrapper = mount(HomeScreen, {
      props: { recentsAvailable: false },
    });
    await wrapper.find("button.home-icon").trigger("click");

    const events = wrapper.emitted("launch");
    expect(events).toBeTruthy();
    expect(events?.[0]).toEqual(["alpha"]);
  });

  it("activates a tile via Enter key (a11y keyboard path)", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" })]);

    const wrapper = mount(HomeScreen, {
      props: { recentsAvailable: false },
    });
    await wrapper.find("button.home-icon").trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("launch")).toBeTruthy();
  });

  it("M1.3.6: forwards the matching `launching` prop to each HomeScreenIcon", () => {
    currentKernel = makeKernel([
      manifest({ id: "alpha", name: "Alpha" }),
      manifest({ id: "beta", name: "Beta" }),
      manifest({ id: "gamma", name: "Gamma" }),
    ]);

    const wrapper = mount(HomeScreen, {
      props: {
        recentsAvailable: false,
        launchingManifestIds: new Set<string>(["beta"]),
      },
    });

    const icons = wrapper.findAll("button.home-icon");
    expect(icons.length).toBe(3);
    expect(icons[0].attributes("aria-busy")).toBeUndefined();
    expect(icons[1].attributes("aria-busy")).toBe("true");
    expect(icons[2].attributes("aria-busy")).toBeUndefined();
  });

  it("keeps desktop-only manifests launchable on the mobile home screen", async () => {
    currentKernel = makeKernel([
      manifest({ id: "desktop-tool", name: "Desktop Tool", supportedShells: ["desktop"] }),
    ]);

    const wrapper = mount(HomeScreen, {
      props: { recentsAvailable: false },
    });

    const icon = wrapper.find("button.home-icon");
    expect(icon.attributes("data-manifest-id")).toBe("desktop-tool");
    expect(wrapper.find("button.home-icon").attributes("disabled")).toBeUndefined();

    await wrapper.find("button.home-icon").trigger("click");

    expect(wrapper.emitted("launch")?.[0]).toEqual(["desktop-tool"]);
  });

  it("mounts MobileWidgetsPage on page 2 (M1.4 commit B)", () => {
    const wrapper = mount(HomeScreen, {
      props: { recentsAvailable: false },
    });
    // its empty state — but the page container itself must exist on
    expect(wrapper.find(".mobile-widgets-page").exists()).toBe(true);
    expect(wrapper.find(".mobile-widgets-page__empty").exists()).toBe(true);
  });

  it("keeps the Recents FAB mounted and inert on the widgets page", async () => {
    const wrapper = mount(HomeScreen, {
      attachTo: document.body,
      props: { recentsAvailable: true },
    });

    const fab = wrapper.find(".home-screen__recents-fab");
    expect(fab.exists()).toBe(true);
    expect(fab.classes()).not.toContain("home-screen__recents-fab--hidden");
    expect(fab.attributes("aria-hidden")).toBeUndefined();
    expect(fab.attributes("tabindex")).toBe("0");

    interface PagerExposed {
      seek: (i: number) => void;
    }
    const pager = (wrapper.vm.$refs as { pagerRef: PagerExposed }).pagerRef;
    pager.seek(1);
    await nextTick();

    const hiddenFab = wrapper.find(".home-screen__recents-fab");
    expect(hiddenFab.exists()).toBe(true);
    expect(hiddenFab.classes()).toContain("home-screen__recents-fab--hidden");
    expect(hiddenFab.attributes("aria-hidden")).toBe("true");
    expect(hiddenFab.attributes("tabindex")).toBe("-1");
  });

  it("scrollEl exposure: page 1 returns the icon page scroll element, page 2 returns null", async () => {
    currentKernel = makeKernel([manifest({ id: "alpha" })]);

    const wrapper = mount(HomeScreen, {
      attachTo: document.body,
      props: { recentsAvailable: false },
    });

    interface HomeScreenExposed {
      scrollEl: HTMLElement | null;
    }
    const vm = wrapper.vm as unknown as HomeScreenExposed;

    expect(vm.scrollEl).toBeInstanceOf(HTMLElement);

    interface PagerExposed {
      seek: (i: number) => void;
    }
    const pager = (wrapper.vm.$refs as { pagerRef: PagerExposed }).pagerRef;
    pager.seek(1);

    await nextTick();

    expect(vm.scrollEl).toBeNull();
  });
});
