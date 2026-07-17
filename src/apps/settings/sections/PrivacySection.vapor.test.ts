import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, markRaw, type Component } from "vue";

import { kernel } from "~/core/kernel";
import { usePermissionStore } from "~/core/permissions/PermissionStore";
import type { AppManifest } from "~/types/app";
import { KernelInjectionKey } from "~/types/kernel";

import PrivacySection from "./PrivacySection.vue";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon: Component = markRaw(
  defineVaporComponent(() => document.createElementNS("http://www.w3.org/2000/svg", "svg")),
);

function makeManifest(id: string, name: string): AppManifest {
  return {
    id,
    name,
    icon: StubIcon,
    category: "productivity",
    component: () => Promise.resolve({ default: StubIcon }),
  };
}

describe("PrivacySection (M3.5)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
    localStorage.clear();
  });

  function mountSection() {
    return mount(PrivacySection, {
      global: { provide: { [KernelInjectionKey as symbol]: kernel } },
    });
  }

  it("renders the empty state when no decisions are persisted", () => {
    const wrapper = mountSection();
    expect(wrapper.find(".privacy__empty").exists()).toBe(true);
    expect(wrapper.find(".privacy__app-list").exists()).toBe(false);
  });

  it("renders telemetry as opt-in and toggles the persisted setting", async () => {
    const wrapper = mountSection();

    const toggle = wrapper.find(".privacy__telemetry [role='switch']");
    expect(toggle.attributes("aria-checked")).toBe("false");
    expect(kernel.settings.get("telemetryEnabled")).toBe(false);

    (toggle.element as HTMLInputElement).checked = true;
    await toggle.trigger("change");
    await flushPromises();

    expect(kernel.settings.get("telemetryEnabled")).toBe(true);
    expect(wrapper.find(".privacy__telemetry [role='switch']").attributes("aria-checked")).toBe(
      "true",
    );
  });

  it("renders one group per app with each remembered decision row", async () => {
    kernel.apps.register(makeManifest("rss", "RSS Reader"));
    kernel.apps.register(makeManifest("weather", "Weather"));

    const store = usePermissionStore();
    store.set("rss", "notifications.post", true, Date.now());
    store.set("rss", "network.fetch", false, Date.now());
    store.set("weather", "notifications.post", true, Date.now());

    const wrapper = mountSection();

    const apps = wrapper.findAll(".privacy__app");
    expect(apps).toHaveLength(2);
    expect(apps[0].find(".privacy__app-name").text()).toBe("RSS Reader");
    expect(apps[1].find(".privacy__app-name").text()).toBe("Weather");

    const rssRows = apps[0].findAll(".privacy__row");
    expect(rssRows).toHaveLength(2);
    expect(rssRows[0].text()).toContain("Blocked from access the network");
    expect(rssRows[1].text()).toContain("Allowed to send you notifications");
  });

  it("revoke button calls kernel.permissions.revoke and removes the row reactively", async () => {
    kernel.apps.register(makeManifest("rss", "RSS Reader"));
    const store = usePermissionStore();
    store.set("rss", "notifications.post", true, Date.now());

    const wrapper = mountSection();
    expect(wrapper.findAll(".privacy__row")).toHaveLength(1);

    const revokeButton = wrapper.find(".privacy__row button");
    await revokeButton.trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".privacy__row")).toHaveLength(0);
    expect(wrapper.find(".privacy__empty").exists()).toBe(true);

    expect(store.list()).toEqual([]);
  });

  it("reactively appends a new row when a `permission.granted` event fires (e.g. fresh prompt)", async () => {
    kernel.apps.register(makeManifest("rss", "RSS Reader"));
    const wrapper = mountSection();

    expect(wrapper.find(".privacy__empty").exists()).toBe(true);

    usePermissionStore().set("rss", "notifications.post", true, Date.now());
    kernel.events.emit("permission.granted", {
      manifestId: "rss",
      permission: "notifications.post",
      persisted: true,
    });
    await flushPromises();

    expect(wrapper.find(".privacy__empty").exists()).toBe(false);
    expect(wrapper.findAll(".privacy__row")).toHaveLength(1);
  });

  it("falls back to the manifestId when the app is no longer registered", () => {
    usePermissionStore().set("ghost-app", "notifications.post", true, Date.now());
    const wrapper = mountSection();

    const app = wrapper.find(".privacy__app");
    expect(app.find(".privacy__app-name").text()).toBe("ghost-app");
    expect(app.find(".privacy__app-id").text()).toBe("ghost-app");
  });
});
