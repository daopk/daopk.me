import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { useInstalledAppsStore } from "~/core/apps/InstalledAppsStore";
import { installExternalApp } from "~/core/apps/installExternalApp";
import type { ExternalAppManifest } from "~/types/externalApp";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import AppStore from "./App.vue";

vi.mock("~/core/apps/installExternalApp", () => ({ installExternalApp: vi.fn() }));

const installMock = vi.mocked(installExternalApp);

const REGISTRY = {
  apps: [
    {
      id: "weather",
      name: "Weather",
      version: "1.0.0",
      description: "Local forecast",
      manifestUrl: "https://apps.example.com/weather.json",
    },
  ],
};

const INSTALLED_MANIFEST: ExternalAppManifest = {
  id: "weather",
  name: "Weather",
  version: "0.9.0",
  category: "productivity",
  entry: "https://apps.example.com/weather.mjs",
  icon: { type: "url", src: "https://apps.example.com/weather.png" },
};

function makeKernel(): Kernel {
  return { events: { on: vi.fn(() => vi.fn()), emit: vi.fn() } } as unknown as Kernel;
}

function stubFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const mountedWrappers: Array<ReturnType<typeof mountStore>> = [];

function mountStore(kernel: Kernel = makeKernel()) {
  const wrapper = mount(AppStore, {
    attachTo: document.body,
    global: { provide: { [KernelInjectionKey as symbol]: kernel } },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

async function waitForItems(wrapper: ReturnType<typeof mountStore>): Promise<void> {
  await vi.waitFor(
    () => {
      if (wrapper.findAll(".app-store__item").length === 0) {
        throw new Error("catalog not yet rendered");
      }
    },
    { timeout: 1500, interval: 20 },
  );
}

describe("App Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    installMock.mockReset();
  });

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
    useInstalledAppsStore().dispose();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("lists catalog apps with an Install action", async () => {
    stubFetch(REGISTRY);
    const wrapper = mountStore();

    await waitForItems(wrapper);

    expect(wrapper.text()).toContain("Weather");
    expect(wrapper.text()).toContain("v1.0.0");
    expect(wrapper.text()).toContain("Local forecast");
    expect(wrapper.find(".app-store__install").text()).toBe("Install");
  });

  it("installs a listing through the install service", async () => {
    installMock.mockResolvedValue({ ok: true, manifest: INSTALLED_MANIFEST, isUpdate: false });
    stubFetch(REGISTRY);
    const kernel = makeKernel();
    const wrapper = mountStore(kernel);

    await waitForItems(wrapper);
    await wrapper.find(".app-store__install").trigger("click");
    await flushPromises();
    await nextTick();

    expect(installMock).toHaveBeenCalledWith(
      "https://apps.example.com/weather.json",
      expect.objectContaining({ kernel, confirm: expect.any(Function) }),
    );
  });

  it("labels an installed app at a different version as Update", async () => {
    stubFetch(REGISTRY);
    const store = useInstalledAppsStore();
    store.hydrate();
    store.add({
      manifestUrl: "https://apps.example.com/weather.json",
      manifest: INSTALLED_MANIFEST,
    });
    const wrapper = mountStore();

    await waitForItems(wrapper);

    expect(wrapper.find(".app-store__install").text()).toBe("Update");
  });

  it("shows an error state when the catalog cannot be loaded", async () => {
    stubFetch("unavailable", 500);
    const wrapper = mountStore();

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Could not load the catalog");
    });
  });
});
