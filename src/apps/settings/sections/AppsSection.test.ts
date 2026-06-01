import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { useInstalledAppsStore } from "~/core/apps/InstalledAppsStore";
import { uninstallExternalApp } from "~/core/apps/installExternalApp";
import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import AppsSection from "./AppsSection.vue";

vi.mock("~/core/apps/installExternalApp", () => ({
  uninstallExternalApp: vi.fn(),
}));

const uninstallMock = vi.mocked(uninstallExternalApp);

const IconStub = defineComponent({
  name: "IconStub",
  render: () => h("span", { class: "icon-stub" }),
});

const EXTERNAL_RECORD = {
  manifestUrl: "https://apps.example.com/m.json",
  manifest: {
    id: "hello-world",
    name: "Hello World",
    version: "1.2.0",
    category: "productivity" as const,
    entry: "https://apps.example.com/app.mjs",
    icon: { type: "url" as const, src: "https://apps.example.com/icon.png" },
  },
};

function manifest(overrides: Partial<AppManifest>): AppManifest {
  return {
    id: "x",
    name: "X",
    version: "1.0.0",
    category: "productivity",
    icon: IconStub,
    component: async () => ({ default: IconStub }),
    ...overrides,
  } as AppManifest;
}

function makeKernel(apps: AppManifest[]) {
  const emit = vi.fn();
  const kernel = {
    apps: { list: () => apps },
    events: { on: vi.fn(() => vi.fn()), emit },
  } as unknown as Kernel;
  return { kernel, emit };
}

const mountedWrappers: Array<ReturnType<typeof mountSection>> = [];

function mountSection(kernel: Kernel) {
  const wrapper = mount(AppsSection, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel } },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

async function paint(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
}

function dialogButtonByText(text: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  expect(button).toBeDefined();
  return button!;
}

describe("AppsSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    uninstallMock.mockReset();
  });

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
    useInstalledAppsStore().dispose();
    localStorage.clear();
  });

  it("shows versions and badges only installed external apps", () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    store.add(EXTERNAL_RECORD);

    const { kernel } = makeKernel([
      manifest({ id: "finder", name: "Finder", version: "1.0.0", category: "system" }),
      manifest({ id: "hello-world", name: "Hello World", version: "1.2.0" }),
    ]);
    const wrapper = mountSection(kernel);

    expect(wrapper.text()).toContain("Finder");
    expect(wrapper.text()).toContain("Hello World");
    expect(wrapper.text()).toContain("v1.0.0");
    expect(wrapper.text()).toContain("v1.2.0");

    const badges = wrapper.findAll(".apps-settings__badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]!.text()).toBe("External");

    expect(wrapper.findAll(".apps-settings__uninstall-action")).toHaveLength(1);
  });

  it("does not show the URL install form", () => {
    useInstalledAppsStore().hydrate();
    const { kernel } = makeKernel([]);
    const wrapper = mountSection(kernel);

    expect(wrapper.find("#apps-install-url").exists()).toBe(false);
    expect(wrapper.find("form.apps-settings__install").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Install from URL");
  });

  it("uninstalls an external app after confirming the dialog", async () => {
    uninstallMock.mockResolvedValue(true);
    const store = useInstalledAppsStore();
    store.hydrate();
    store.add(EXTERNAL_RECORD);
    const { kernel } = makeKernel([
      manifest({ id: "hello-world", name: "Hello World", version: "1.2.0" }),
    ]);
    const wrapper = mountSection(kernel);

    await wrapper.find(".apps-settings__uninstall-action").trigger("click");
    await paint();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Uninstall Hello World?");

    dialogButtonByText("Uninstall").click();
    await paint();

    expect(uninstallMock).toHaveBeenCalledWith("hello-world", expect.objectContaining({ kernel }));
  });
});
