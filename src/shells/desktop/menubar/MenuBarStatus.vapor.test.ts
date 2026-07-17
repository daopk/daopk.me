import { mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MenuBarStatus from "./MenuBarStatus.vue";

vi.mock("~/components/widgets/WidgetHost.vue", async () => {
  const { defineVaporComponent, renderEffect } = await import("vue");
  return {
    default: defineVaporComponent(
      (props: { readonly surface: string }) => {
        const host = document.createElement("span");
        host.className = "widget-host-stub";
        renderEffect(() => {
          host.dataset.surface = props.surface;
        });
        return host;
      },
      { props: ["surface"] },
    ),
  };
});

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function mountStatus() {
  return mount(MenuBarStatus, {
    attachTo: document.body,
    global: {
      plugins: [createPinia()],
    },
  });
}

describe("MenuBarStatus", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setNavigatorOnline(true);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    setNavigatorOnline(true);
    vi.unstubAllGlobals();
  });

  it("renders menubar widgets without an inline theme control", () => {
    const wrapper = mountStatus();

    expect(wrapper.find(".widget-host-stub").attributes("data-surface")).toBe("desktop:menubar");
    expect(wrapper.find(".menubar-status__theme-trigger").exists()).toBe(false);
    expect(wrapper.find(".menubar-status__offline").exists()).toBe(false);

    wrapper.unmount();
  });

  it("shows an offline status when the browser goes offline", async () => {
    const wrapper = mountStatus();

    setNavigatorOnline(false);
    window.dispatchEvent(new Event("offline"));
    await wrapper.vm.$nextTick();

    const offline = wrapper.find(".menubar-status__offline");
    expect(offline.exists()).toBe(true);
    expect(offline.attributes("aria-label")).toBe("Offline");
    expect(offline.text()).toBe("offline");

    setNavigatorOnline(true);
    window.dispatchEvent(new Event("online"));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".menubar-status__offline").exists()).toBe(false);

    wrapper.unmount();
  });
});
