import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AboutDeviceSection from "./AboutDeviceSection.vue";

import { useSettingsStore } from "~/core/storage/SettingsStore";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";

function mountSection() {
  return mount(AboutDeviceSection, {
    attachTo: document.body,
  });
}

describe("AboutDeviceSection (M2b.1bis)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
    serviceWorkerUpdateController.resetForTests();
  });

  afterEach(() => {
    serviceWorkerUpdateController.resetForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the retained diagnostic rows and omits removed preferences", () => {
    const store = useSettingsStore();
    store.$patch({ bootCount: 7, theme: "dark", reduceMotion: "never" });

    const wrapper = mountSection();

    const text = wrapper.text();
    expect(text).toContain("Build time");
    expect(text).toContain("Boot count");
    expect(text).toContain("7");
    expect(text).toContain("User-agent");
    expect(text).not.toContain("Form factor");
    expect(text).not.toContain("Platform");
    expect(text).not.toContain("Theme preference");
    expect(text).not.toContain("Reduce motion");
    expect(text).not.toContain("Active overrides");
    expect(text).not.toContain("Override map");

    wrapper.unmount();
  });

  it("renders Software update as an independent card above the diagnostic list", () => {
    const wrapper = mountSection();

    const updateCard = wrapper.find(".about-device__update-card");
    expect(updateCard.exists()).toBe(true);
    expect(updateCard.text()).toContain("Software update");
    expect(updateCard.text()).not.toContain("Manual check available.");
    expect(updateCard.find("button").text()).toContain("Check for updates");
    expect(
      updateCard.element.compareDocumentPosition(wrapper.get(".about-device__list").element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    wrapper.unmount();
  });

  it("runs a manual update check from the software update card", async () => {
    const check = vi.fn(async () => undefined);
    serviceWorkerUpdateController.setUpdateChecker(check);
    const wrapper = mountSection();

    const button = wrapper.get("button");
    expect(wrapper.text()).toContain("Software update");
    expect(button.text()).toContain("Check for updates");

    await button.trigger("click");
    await flushPromises();

    expect(check).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("You're up to date.");

    wrapper.unmount();
  });

  it("refreshes from the software update card when an update is available", async () => {
    const update = vi.fn(async () => undefined);
    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    const wrapper = mountSection();

    expect(wrapper.text()).toContain("Update available");
    expect(wrapper.get("button").text()).toContain("Refresh");

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(update).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});
