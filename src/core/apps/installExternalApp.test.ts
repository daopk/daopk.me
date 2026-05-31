import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "~/core/storage/SettingsStore";
import type { AppManifest, AppPermission } from "~/types/app";
import type { ExternalAppManifest } from "~/types/externalApp";
import type { Kernel } from "~/types/kernel";

import { useInstalledAppsStore } from "./InstalledAppsStore";
import { installExternalApp, uninstallExternalApp } from "./installExternalApp";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function externalManifest(overrides: Partial<ExternalAppManifest> = {}): ExternalAppManifest {
  return {
    id: "hello-world",
    name: "Hello World",
    version: "1.0.0",
    category: "productivity",
    entry: "https://apps.example.com/hello/app.mjs",
    icon: { type: "url", src: "https://apps.example.com/hello/icon.png" },
    ...overrides,
  };
}

interface FakeKernelOptions {
  registeredIds?: string[];
  processes?: Array<{ handleId: string; manifestId: string }>;
  permissions?: Array<{ manifestId: string; permission: AppPermission }>;
}

function createFakeKernel(opts: FakeKernelOptions = {}) {
  const manifests = new Map<string, AppManifest>();
  for (const id of opts.registeredIds ?? []) {
    manifests.set(id, { id, name: id } as AppManifest);
  }
  const processes = new Map<string, { state: string; manifestId: string }>();
  for (const p of opts.processes ?? []) {
    processes.set(p.handleId, { state: "running", manifestId: p.manifestId });
  }
  let permissions = [...(opts.permissions ?? [])];
  const listeners = new Map<string, Set<(payload: { handleId: string }) => void>>();
  const order: string[] = [];

  const kernel = {
    apps: {
      list: () => [...manifests.values()],
      register: (m: AppManifest) => {
        order.push(`register:${m.id}`);
        manifests.set(m.id, m);
      },
      unregister: (id: string) => {
        order.push(`unregister:${id}`);
        manifests.delete(id);
      },
    },
    processes: {
      list: () => processes.entries(),
      kill: (handleId: string) => {
        order.push(`kill:${handleId}`);
        const record = processes.get(handleId);
        processes.delete(handleId);
        if (record) {
          listeners.get("app.killed")?.forEach((cb) => cb({ handleId }));
        }
      },
    },
    events: {
      on: (event: string, cb: (payload: { handleId: string }) => void) => {
        const set = listeners.get(event) ?? new Set();
        set.add(cb);
        listeners.set(event, set);
        return () => set.delete(cb);
      },
    },
    permissions: {
      list: (filter?: { manifestId?: string }) =>
        permissions.filter((e) => !filter?.manifestId || e.manifestId === filter.manifestId),
      revoke: (id: string, permission: AppPermission) => {
        order.push(`revoke:${id}`);
        const before = permissions.length;
        permissions = permissions.filter(
          (e) => !(e.manifestId === id && e.permission === permission),
        );
        return permissions.length < before;
      },
    },
  } as unknown as Kernel;

  return { kernel, order, manifests };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("installExternalApp", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    useInstalledAppsStore().dispose();
    useSettingsStore().dispose();
    localStorage.clear();
  });

  it("rejects a non-https or invalid manifest URL", async () => {
    const { kernel } = createFakeKernel();
    const confirm = vi.fn(async () => true);

    expect((await installExternalApp("http://x/m.json", { kernel, confirm })).ok).toBe(false);
    expect((await installExternalApp("not a url", { kernel, confirm })).ok).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("fails when the manifest cannot be fetched", async () => {
    const { kernel } = createFakeKernel();
    const result = await installExternalApp("https://apps.example.com/m.json", {
      kernel,
      confirm: vi.fn(async () => true),
      fetchImpl: vi.fn(async () => jsonResponse(null, false, 404)) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("fetch-failed");
  });

  it("rejects an invalid manifest body", async () => {
    const { kernel } = createFakeKernel();
    const result = await installExternalApp("https://apps.example.com/m.json", {
      kernel,
      confirm: vi.fn(async () => true),
      fetchImpl: vi.fn(async () => jsonResponse({ id: "X" })) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-manifest");
  });

  it("refuses to shadow an existing non-external id", async () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    const { kernel } = createFakeKernel({ registeredIds: ["weather"] });
    const result = await installExternalApp("https://apps.example.com/m.json", {
      kernel,
      store,
      confirm: vi.fn(async () => true),
      fetchImpl: vi.fn(async () =>
        jsonResponse(externalManifest({ id: "weather" })),
      ) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("id-conflict");
  });

  it("does not install when consent is declined", async () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    const { kernel, manifests } = createFakeKernel();
    const result = await installExternalApp("https://apps.example.com/m.json", {
      kernel,
      store,
      confirm: vi.fn(async () => false),
      fetchImpl: vi.fn(async () => jsonResponse(externalManifest())) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("declined");
    expect(store.has("hello-world")).toBe(false);
    expect(manifests.has("hello-world")).toBe(false);
  });

  it("installs: persists to the store and registers in the kernel", async () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    const { kernel, manifests } = createFakeKernel();
    const confirm = vi.fn(async () => true);

    const result = await installExternalApp("https://apps.example.com/m.json", {
      kernel,
      store,
      confirm,
      fetchImpl: vi.fn(async () => jsonResponse(externalManifest())) as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.isUpdate).toBe(false);
    expect(store.has("hello-world")).toBe(true);
    expect(manifests.has("hello-world")).toBe(true);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ entryOrigin: "https://apps.example.com", isUpdate: false }),
    );
  });

  it("treats a re-install of an existing external id as an update", async () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    const { kernel, order } = createFakeKernel();
    const deps = {
      kernel,
      store,
      confirm: vi.fn(async () => true),
    };

    await installExternalApp("https://apps.example.com/m.json", {
      ...deps,
      fetchImpl: vi.fn(async () => jsonResponse(externalManifest())) as unknown as typeof fetch,
    });
    const result = await installExternalApp("https://apps.example.com/m.json", {
      ...deps,
      fetchImpl: vi.fn(async () =>
        jsonResponse(externalManifest({ version: "2.0.0" })),
      ) as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.isUpdate).toBe(true);
    expect(store.get("hello-world")?.manifest.version).toBe("2.0.0");
    expect(order.filter((o) => o === "unregister:hello-world").length).toBeGreaterThanOrEqual(1);
  });
});

describe("uninstallExternalApp", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    useInstalledAppsStore().dispose();
    useSettingsStore().dispose();
    localStorage.clear();
  });

  it("returns false for ids that are not installed external apps", async () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    const { kernel } = createFakeKernel({ registeredIds: ["finder"] });
    expect(await uninstallExternalApp("finder", { kernel, store })).toBe(false);
  });

  it("kills processes before unregister, then revokes perms and scrubs dock pins", async () => {
    const store = useInstalledAppsStore();
    store.hydrate();
    store.add({
      manifestUrl: "https://apps.example.com/m.json",
      manifest: externalManifest(),
    });

    const settingsStore = useSettingsStore();
    settingsStore.hydrate();
    settingsStore.setDockPinnedAppIds(["hello-world", "finder"]);

    const { kernel, order, manifests } = createFakeKernel({
      registeredIds: ["hello-world"],
      processes: [{ handleId: "p1", manifestId: "hello-world" }],
      permissions: [{ manifestId: "hello-world", permission: "network.fetch" }],
    });

    const removed = await uninstallExternalApp("hello-world", {
      kernel,
      store,
      settingsStore,
      killTimeoutMs: 1000,
    });

    expect(removed).toBe(true);
    expect(store.has("hello-world")).toBe(false);
    expect(manifests.has("hello-world")).toBe(false);
    expect(kernel.permissions.list({ manifestId: "hello-world" })).toEqual([]);
    expect(settingsStore.dockPinnedAppIds).toEqual(["finder"]);

    const killIndex = order.indexOf("kill:p1");
    const unregisterIndex = order.indexOf("unregister:hello-world");
    expect(killIndex).toBeGreaterThanOrEqual(0);
    expect(killIndex).toBeLessThan(unregisterIndex);
  });
});
