import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, type Component } from "vue";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";

import AppStore from "./App.vue";

const IconStub = defineComponent({
  name: "IconStub",
  render: () => h("span", { class: "icon-stub" }),
});

function manifest(overrides: Partial<AppManifest> & { id: string; name: string }): AppManifest {
  return {
    version: "1.0.0",
    category: "productivity",
    icon: IconStub as Component,
    component: async () => ({ default: IconStub }),
    ...overrides,
  };
}

function makeKernel(initialApps: AppManifest[]) {
  const apps = [...initialApps];
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const emit = vi.fn((channel: string, payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) {
      listener(payload);
    }
  });
  const on = vi.fn((channel: string, listener: (payload: unknown) => void) => {
    const bucket = listeners.get(channel) ?? new Set<(payload: unknown) => void>();
    bucket.add(listener);
    listeners.set(channel, bucket);
    return (): void => {
      bucket.delete(listener);
    };
  });
  const register = vi.fn((app: AppManifest) => {
    const index = apps.findIndex((candidate) => candidate.id === app.id);
    if (index === -1) {
      apps.push(app);
    } else {
      apps[index] = app;
    }
    emit("app.registered", { id: app.id });
  });
  const kernel = {
    apps: { list: vi.fn(() => [...apps]), register },
    events: { on, emit },
  } as unknown as Kernel;
  return { apps, emit, kernel, register };
}

function fetchResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn(async () => payload),
  } as unknown as Response;
}

function stubCatalog(payload: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => fetchResponse(payload, ok, status)),
  );
}

const mountedWrappers: Array<ReturnType<typeof mountStore>> = [];

function mountStore(kernel: Kernel) {
  const wrapper = mount(AppStore, {
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

describe("App Store", () => {
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
    vi.unstubAllGlobals();
  });

  it("renders registered first-party apps in category groups", () => {
    const { kernel } = makeKernel([
      manifest({ id: "notes", name: "Notes", version: "1.0.0" }),
      manifest({ id: "photos", name: "Photos", category: "media", version: "1.0.0" }),
      manifest({ id: "hello-world", name: "Hello World", version: "1.2.0" }),
      manifest({ id: "settings", name: "Settings", category: "system" }),
      manifest({ id: "browser", name: "Browser", hidden: true }),
    ]);
    const wrapper = mountStore(kernel);

    expect(wrapper.findAll(".app-store__section-title").map((node) => node.text())).toEqual([
      "Productivity",
      "Media",
    ]);
    expect(wrapper.findAll(".app-store__card")).toHaveLength(2);
    expect(wrapper.text()).toContain("Notes");
    expect(wrapper.text()).toContain("Photos");
    expect(wrapper.text()).toContain("v1.0.0");
    expect(wrapper.text()).not.toContain("Hello World");
    expect(wrapper.text()).not.toContain("Settings");
    expect(wrapper.text()).not.toContain("Browser");
    expect(wrapper.find(".app-store__launch").text()).toBe("Open");
  });

  it("launches a first-party app", async () => {
    const { emit, kernel } = makeKernel([manifest({ id: "notes", name: "Notes" })]);
    const wrapper = mountStore(kernel);

    await wrapper.find(".app-store__launch").trigger("click");

    expect(emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "notes",
      source: "api",
    });
  });

  it("refreshes when first-party apps are registered", async () => {
    const { apps, emit, kernel } = makeKernel([]);
    const wrapper = mountStore(kernel);

    expect(wrapper.text()).toContain("No first-party apps available.");

    apps.push(manifest({ id: "notes", name: "Notes" }));
    emit("app.registered", { id: "notes" });
    await nextTick();

    expect(wrapper.text()).toContain("Notes");
  });

  it("checks the first-party catalog and marks only newer versions as updates", async () => {
    stubCatalog({
      apps: [
        { id: "notes", version: "1.0.1", entry: "/apps/notes/1.0.1/notes.js" },
        { id: "photos", version: "0.9.0", entry: "/apps/photos/0.9.0/photos.js" },
        { id: "browser", version: "1.0.0", entry: "/apps/browser/1.0.0/browser.js" },
      ],
    });
    const { kernel } = makeKernel([
      manifest({ id: "notes", name: "Notes", version: "1.0.0" }),
      manifest({ id: "photos", name: "Photos", category: "media", version: "1.0.0" }),
      manifest({ id: "browser", name: "Browser", version: "1.0.0" }),
    ]);
    const wrapper = mountStore(kernel);

    await wrapper.find(".app-store__check").trigger("click");
    await paint();

    expect(wrapper.text()).toContain("1 update available.");
    expect(wrapper.findAll(".app-store__update")).toHaveLength(1);
    expect(wrapper.find(".app-store__update").text()).toBe("Update");
    expect(wrapper.findAll(".app-store__launch")).toHaveLength(2);
    expect(wrapper.text()).toContain("v1.0.1");
  });

  it("reports up to date when catalog versions are equal, older, or invalid", async () => {
    stubCatalog({
      apps: [
        { id: "notes", version: "1.0.0", entry: "/apps/notes/1.0.0/notes.js" },
        { id: "photos", version: "0.9.0", entry: "/apps/photos/0.9.0/photos.js" },
        { id: "browser", version: "next", entry: "/apps/browser/next/browser.js" },
      ],
    });
    const { kernel } = makeKernel([
      manifest({ id: "notes", name: "Notes", version: "1.0.0" }),
      manifest({ id: "photos", name: "Photos", category: "media", version: "1.0.0" }),
      manifest({ id: "browser", name: "Browser", version: "1.0.0" }),
    ]);
    const wrapper = mountStore(kernel);

    await wrapper.find(".app-store__check").trigger("click");
    await paint();

    expect(wrapper.text()).toContain("All apps are up to date.");
    expect(wrapper.findAll(".app-store__update")).toHaveLength(0);
    expect(wrapper.findAll(".app-store__launch")).toHaveLength(3);
  });

  it("surfaces catalog check failures without changing app actions", async () => {
    stubCatalog({ apps: [] }, false, 503);
    const { kernel } = makeKernel([manifest({ id: "notes", name: "Notes", version: "1.0.0" })]);
    const wrapper = mountStore(kernel);

    await wrapper.find(".app-store__check").trigger("click");
    await paint();

    expect(wrapper.text()).toContain("Could not check for updates (503).");
    expect(wrapper.findAll(".app-store__update")).toHaveLength(0);
    expect(wrapper.findAll(".app-store__launch")).toHaveLength(1);
  });

  it("updates a first-party app by re-registering its catalog manifest", async () => {
    stubCatalog({
      apps: [{ id: "notes", version: "1.0.1", entry: "/apps/notes/1.0.1/notes.js" }],
    });
    const { kernel, register } = makeKernel([
      manifest({ id: "notes", name: "Notes", version: "1.0.0" }),
    ]);
    const wrapper = mountStore(kernel);

    await wrapper.find(".app-store__check").trigger("click");
    await paint();
    await wrapper.find(".app-store__update").trigger("click");
    await paint();

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ id: "notes", version: "1.0.1" }),
    );
    expect(wrapper.text()).toContain("v1.0.1");
    expect(wrapper.text()).toContain("All apps are up to date.");
    expect(wrapper.findAll(".app-store__update")).toHaveLength(0);
    expect(wrapper.find(".app-store__launch").text()).toBe("Open");
  });
});
