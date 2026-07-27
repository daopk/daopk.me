import { mountVaporComposable } from "~/test/mountVapor";
import { describe, expect, it, vi } from "vitest";
import { defineVaporComponent } from "vue";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import { useMobileManifestProjection } from "./useMobileManifestProjection";

const StubIcon = defineVaporComponent(() => document.createElement("svg"));
const StubApp = defineVaporComponent(() => document.createElement("div"));

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: "alpha",
    name: "Alpha",
    icon: StubIcon,
    category: "system",
    component: async () => ({ default: StubApp }),
    ...overrides,
  };
}

function makeRegistry(initial: AppManifest[]): {
  readonly kernel: Pick<Kernel, "apps" | "events">;
  readonly manifests: AppManifest[];
  emit(channel: "app.registered" | "app.unregistered", id: string): void;
  listenerCount(channel: "app.registered" | "app.unregistered"): number;
} {
  type RegistryEvent = "app.registered" | "app.unregistered";
  type Listener = (payload: { id: string }) => void;

  const manifests = [...initial];
  const listeners = new Map<RegistryEvent, Set<Listener>>();
  const kernel = {
    apps: {
      list: vi.fn(() => [...manifests]),
      register: vi.fn(),
      launch: vi.fn(),
      unregister: vi.fn(),
    },
    events: {
      on: vi.fn((channel: RegistryEvent, listener: Listener) => {
        const bucket = listeners.get(channel) ?? new Set<Listener>();
        bucket.add(listener);
        listeners.set(channel, bucket);
        return (): void => {
          bucket.delete(listener);
        };
      }),
      emit: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
    },
  } as unknown as Pick<Kernel, "apps" | "events">;

  return {
    kernel,
    manifests,
    emit(channel, id): void {
      for (const listener of listeners.get(channel) ?? []) {
        listener({ id });
      }
    },
    listenerCount(channel): number {
      return listeners.get(channel)?.size ?? 0;
    },
  };
}

describe("mobile manifest projection", () => {
  it("projects resolved mobile facts and launcher visibility behind one interface", () => {
    const registry = makeRegistry([
      manifest({
        singleton: true,
        settings: { keywords: ["theme"] },
        chrome: { mobile: { titlebar: "hidden", edgeSwipe: "disabled" } },
      }),
      manifest({ id: "_template", name: "Template" }),
      manifest({ id: "hidden", name: "Hidden", hidden: true }),
      manifest({
        id: "desktop-tool",
        name: "Desktop Tool",
        supportedShells: ["desktop"],
      }),
    ]);
    const mounted = mountVaporComposable(() => useMobileManifestProjection(registry.kernel));

    expect(mounted.result.find("alpha")).toMatchObject({
      id: "alpha",
      name: "Alpha",
      singleton: true,
      hasSettings: true,
      supported: true,
      unsupportedMessage: null,
      chrome: { titlebar: "hidden", edgeSwipe: "disabled" },
    });
    expect(mounted.result.find("desktop-tool")).toMatchObject({
      supported: false,
      unsupportedMessage:
        "Desktop Tool is not supported on mobile. Open it from the desktop shell.",
      chrome: { titlebar: "visible", edgeSwipe: "enabled" },
    });
    expect(mounted.result.launcher.value.map((entry) => entry.id)).toEqual([
      "alpha",
      "desktop-tool",
    ]);
  });

  it("refreshes lookup and launcher snapshots for live registrations", () => {
    const registry = makeRegistry([manifest()]);
    const mounted = mountVaporComposable(() => useMobileManifestProjection(registry.kernel));

    registry.manifests[0] = manifest({ name: "Alpha 2" });
    registry.emit("app.registered", "alpha");

    expect(mounted.result.find("alpha")?.name).toBe("Alpha 2");

    registry.manifests.push(manifest({ id: "beta", name: "Beta" }));
    registry.emit("app.registered", "beta");

    expect(mounted.result.find("beta")?.name).toBe("Beta");
    expect(mounted.result.all.value.map((entry) => entry.id)).toEqual(["alpha", "beta"]);
    expect(mounted.result.launcher.value.map((entry) => entry.id)).toEqual(["alpha", "beta"]);

    registry.manifests.splice(
      registry.manifests.findIndex((entry) => entry.id === "alpha"),
      1,
    );
    registry.emit("app.unregistered", "alpha");

    expect(mounted.result.find("alpha")).toBeNull();
    expect(mounted.result.all.value.map((entry) => entry.id)).toEqual(["beta"]);
  });

  it("owns and releases both registry subscriptions with its Vue scope", () => {
    const registry = makeRegistry([]);
    const mounted = mountVaporComposable(() => useMobileManifestProjection(registry.kernel));

    expect(registry.listenerCount("app.registered")).toBe(1);
    expect(registry.listenerCount("app.unregistered")).toBe(1);

    mounted.unmount();

    expect(registry.listenerCount("app.registered")).toBe(0);
    expect(registry.listenerCount("app.unregistered")).toBe(0);
  });
});
