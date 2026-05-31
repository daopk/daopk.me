import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useInstalledAppsStore } from "~/core/apps/InstalledAppsStore";
import type { BootContext } from "~/core/boot/types";
import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import { installedAppsPhase } from "./installedApps";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

const EXTERNAL_RECORD = {
  manifestUrl: "https://apps.example.com/m.json",
  manifest: {
    id: "hello-world",
    name: "Hello World",
    version: "1.0.0",
    category: "productivity" as const,
    entry: "https://apps.example.com/app.mjs",
    icon: { type: "url" as const, src: "https://apps.example.com/icon.png" },
  },
};

function createFakeKernel(registeredIds: string[] = []) {
  const manifests = new Map<string, AppManifest>();
  for (const id of registeredIds) {
    manifests.set(id, { id, name: id } as AppManifest);
  }
  const kernel = {
    apps: {
      list: () => [...manifests.values()],
      register: (m: AppManifest) => manifests.set(m.id, m),
      unregister: (id: string) => manifests.delete(id),
    },
  } as unknown as Kernel;
  return { kernel, manifests };
}

function bootContext(kernel: Kernel, aborted = false): BootContext {
  const controller = new AbortController();
  if (aborted) {
    controller.abort();
  }
  return { kernel, signal: controller.signal };
}

describe("installedAppsPhase", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    useInstalledAppsStore().dispose();
    localStorage.clear();
  });

  it("registers stored external apps into the kernel registry", async () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    store.add(EXTERNAL_RECORD);
    const { kernel, manifests } = createFakeKernel();

    await installedAppsPhase.run(bootContext(kernel));

    expect(manifests.has("hello-world")).toBe(true);
  });

  it("unregisters a stale external app no longer in the store", async () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    const { kernel, manifests } = createFakeKernel(["hello-world", "finder"]);

    await installedAppsPhase.run(bootContext(kernel));

    expect(manifests.has("hello-world")).toBe(false);
    expect(manifests.has("finder")).toBe(true);
  });

  it("does nothing when the boot signal is already aborted", async () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    store.add(EXTERNAL_RECORD);
    const { kernel, manifests } = createFakeKernel();

    await installedAppsPhase.run(bootContext(kernel, true));

    expect(manifests.has("hello-world")).toBe(false);
  });
});
