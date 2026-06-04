import { describe, expect, it, vi } from "vitest";

import type { AppManifest } from "~/types/app";
import type { ExternalAppManifest } from "~/types/externalApp";
import type { Kernel } from "~/types/kernel";

import { type InstalledAppRecord } from "./InstalledAppsStore";
import { reconcileInstalledApps } from "./reconcileInstalledApps";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function record(id: string): InstalledAppRecord {
  const manifest: ExternalAppManifest = {
    id,
    name: id,
    version: "1.0.0",
    category: "productivity",
    entry: `https://apps.example.com/${id}/app.mjs`,
    icon: { type: "iconify", name: "lucide:box" },
  };
  return { manifestUrl: `https://apps.example.com/${id}/m.json`, manifest };
}

function createFakeKernel(registeredIds: string[], registerThrowsFor?: string) {
  const manifests = new Map<string, AppManifest>();
  for (const id of registeredIds) {
    manifests.set(id, { id, name: id } as AppManifest);
  }
  const kernel = {
    apps: {
      list: () => [...manifests.values()],
      register: (m: AppManifest) => {
        if (m.id === registerThrowsFor) {
          throw new Error("boom");
        }
        manifests.set(m.id, m);
      },
      unregister: (id: string) => {
        manifests.delete(id);
      },
    },
  } as unknown as Kernel;
  return { kernel, manifests };
}

describe("reconcileInstalledApps", () => {
  it("registers stored apps that are not yet registered", () => {
    const { kernel, manifests } = createFakeKernel(["finder"]);
    reconcileInstalledApps(kernel, [record("hello-world")]);
    expect(manifests.has("hello-world")).toBe(true);
    expect(manifests.has("finder")).toBe(true);
  });

  it("unregisters stale external apps no longer in the store", () => {
    const { kernel, manifests } = createFakeKernel(["finder", "old-ext"]);
    reconcileInstalledApps(kernel, []);
    expect(manifests.has("old-ext")).toBe(false);
    expect(manifests.has("finder")).toBe(true);
  });

  it("never unregisters built-ins, first-party apps, or dev-only (_) apps", () => {
    const { kernel, manifests } = createFakeKernel([
      "settings",
      "baby-touch",
      "youtube-player",
      "_kit-gallery",
    ]);
    reconcileInstalledApps(kernel, []);
    expect(manifests.has("settings")).toBe(true);
    expect(manifests.has("baby-touch")).toBe(true);
    expect(manifests.has("youtube-player")).toBe(true);
    expect(manifests.has("_kit-gallery")).toBe(true);
  });

  it("is fail-safe: a single failing registration does not stop the others", () => {
    const { kernel, manifests } = createFakeKernel([], "boom");
    reconcileInstalledApps(kernel, [record("boom"), record("good")]);
    expect(manifests.has("boom")).toBe(false);
    expect(manifests.has("good")).toBe(true);
  });
});
