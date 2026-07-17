import { mountVaporTest as mount } from "~/test/mountVapor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent } from "vue";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import AppSwitcher from "./AppSwitcher.vue";

const StubIcon = defineVaporComponent(() => document.createElement("svg"));
const StubApp = defineVaporComponent(() => document.createElement("div"));

function manifest(id: string, name?: string, overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id,
    name: name ?? id,
    icon: StubIcon,
    category: "system",
    component: () => Promise.resolve({ default: StubApp }),
    ...overrides,
  };
}

let currentManifests: AppManifest[] = [];

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "apps"> {
    return {
      apps: {
        list: () => currentManifests,
        register: vi.fn(),
        launch: vi.fn(),
        unregister: vi.fn(),
      },
    };
  },
}));

describe("AppSwitcher", () => {
  beforeEach(() => {
    currentManifests = [manifest("alpha", "Alpha"), manifest("beta", "Beta")];
  });

  it("renders the empty state when the frames array is empty", () => {
    const wrapper = mount(AppSwitcher, { props: { frames: [] }, attachTo: document.body });

    expect(wrapper.find(".app-switcher__empty").exists()).toBe(true);
    expect(wrapper.findAll(".app-switcher-card").length).toBe(0);

    wrapper.unmount();
  });

  it("renders one card per resolvable frame, newest-first", () => {
    const wrapper = mount(AppSwitcher, {
      props: {
        frames: [
          { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
          { frameId: "f-2", handleId: "h-2", manifestId: "beta" },
        ],
      },
      attachTo: document.body,
    });

    const cards = wrapper.findAll(".app-switcher-card");
    expect(cards.length).toBe(2);
    expect(cards[0].attributes("data-frame-id")).toBe("f-2");
    expect(cards[0].find(".app-switcher-card__name").text()).toBe("Beta");
    expect(cards[1].attributes("data-frame-id")).toBe("f-1");
    expect(cards[1].find(".app-switcher-card__name").text()).toBe("Alpha");

    wrapper.unmount();
  });

  it("filters out frames whose manifest was unregistered after launch", () => {
    const wrapper = mount(AppSwitcher, {
      props: {
        frames: [
          { frameId: "f-1", handleId: "h-1", manifestId: "alpha" },
          { frameId: "f-orphan", handleId: "h-orphan", manifestId: "no-longer-registered" },
          { frameId: "f-2", handleId: "h-2", manifestId: "beta" },
        ],
      },
      attachTo: document.body,
    });

    const cards = wrapper.findAll(".app-switcher-card");
    expect(cards.length).toBe(2);
    expect(cards.map((card) => card.attributes("data-manifest-id"))).toEqual(["beta", "alpha"]);

    wrapper.unmount();
  });

  it("renders distinct cards for singleton dup-handleId frames (M1.3.2 key-by-frameId)", () => {
    // The Vue:key must use frameId so both rows render. Using handleId
    const wrapper = mount(AppSwitcher, {
      props: {
        frames: [
          { frameId: "f-1", handleId: "singleton-h", manifestId: "alpha" },
          { frameId: "f-2", handleId: "singleton-h", manifestId: "alpha" },
        ],
      },
      attachTo: document.body,
    });

    const cards = wrapper.findAll(".app-switcher-card");
    expect(cards.length).toBe(2);
    expect(cards.map((card) => card.attributes("data-frame-id"))).toEqual(["f-2", "f-1"]);
    expect(cards.every((card) => card.attributes("data-handle-id") === "singleton-h")).toBe(true);

    wrapper.unmount();
  });

  it("emits `close` when the close button is clicked", async () => {
    const wrapper = mount(AppSwitcher, {
      props: { frames: [{ frameId: "f-1", handleId: "h-1", manifestId: "alpha" }] },
      attachTo: document.body,
    });

    await wrapper.find(".app-switcher__close").trigger("click");

    expect(wrapper.emitted("close")).toBeTruthy();

    wrapper.unmount();
  });

  it("moves initial focus to the close button", async () => {
    const wrapper = mount(AppSwitcher, { props: { frames: [] }, attachTo: document.body });
    const closeButton = wrapper.get(".app-switcher__close").element;

    await vi.waitFor(() => expect(document.activeElement).toBe(closeButton));
    wrapper.unmount();
  });

  it("emits `close` when Escape is pressed inside the dialog", async () => {
    const wrapper = mount(AppSwitcher, {
      props: { frames: [] },
      attachTo: document.body,
    });

    await wrapper.get(".app-switcher").trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("emits `dismiss-all` when the close-all header button is clicked", async () => {
    const wrapper = mount(AppSwitcher, {
      props: { frames: [{ frameId: "f-1", handleId: "h-1", manifestId: "alpha" }] },
      attachTo: document.body,
    });

    await wrapper.find(".app-switcher__dismiss-all").trigger("click");

    expect(wrapper.emitted("dismiss-all")).toEqual([[]]);

    wrapper.unmount();
  });

  it("disables the close-all header button when there are no frames", async () => {
    const wrapper = mount(AppSwitcher, { props: { frames: [] }, attachTo: document.body });

    const button = wrapper.find(".app-switcher__dismiss-all");
    expect(button.attributes("disabled")).toBeDefined();

    await button.trigger("click");
    expect(wrapper.emitted("dismiss-all")).toBeUndefined();

    wrapper.unmount();
  });

  it("emits `close` when Ropav Modal handles pointerdown on the overlay", async () => {
    const wrapper = mount(AppSwitcher, {
      props: { frames: [{ frameId: "f-1", handleId: "h-1", manifestId: "alpha" }] },
      attachTo: document.body,
    });

    const scrim = wrapper.find(".app-switcher__overlay").element as HTMLElement;
    scrim.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("close")).toBeTruthy();

    wrapper.unmount();
  });

  it("does NOT emit `close` when a click inside a card bubbles through the scrim", async () => {
    const wrapper = mount(AppSwitcher, {
      props: { frames: [{ frameId: "f-1", handleId: "h-1", manifestId: "alpha" }] },
      attachTo: document.body,
    });

    await wrapper.find(".app-switcher-card__select").trigger("click");

    expect(wrapper.emitted("close")).toBeUndefined();

    wrapper.unmount();
  });

  it("forwards `select` from a card with the originating frameId", async () => {
    const wrapper = mount(AppSwitcher, {
      props: { frames: [{ frameId: "f-1", handleId: "h-1", manifestId: "alpha" }] },
      attachTo: document.body,
    });

    await wrapper.find(".app-switcher-card__select").trigger("click");

    expect(wrapper.emitted("select")).toEqual([["f-1"]]);

    wrapper.unmount();
  });

  it("forwards `dismiss` from a card with the originating frameId", async () => {
    const wrapper = mount(AppSwitcher, {
      props: { frames: [{ frameId: "f-1", handleId: "h-1", manifestId: "alpha" }] },
      attachTo: document.body,
    });

    await wrapper.find(".app-switcher-card__dismiss").trigger("click");

    expect(wrapper.emitted("dismiss")).toEqual([["f-1"]]);

    wrapper.unmount();
  });

  it("exposes the Ropav dialog semantics and accessible name", () => {
    const wrapper = mount(AppSwitcher, {
      props: { frames: [] },
      attachTo: document.body,
    });

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(dialog.attributes("aria-label")).toBe("Recent apps");

    wrapper.unmount();
  });
});
