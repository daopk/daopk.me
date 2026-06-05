import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, markRaw, type Component } from "vue";

import { debugWarn } from "~/core/debug";
import type { AppManifest } from "~/types/app";
import type { AppPreviewInput, AppPreviewProvider } from "~/types/preview";

import { kernel } from "./index";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

const StubIcon: Component = markRaw(defineComponent({ template: "<svg />" }));
const input: AppPreviewInput = Object.freeze({ kind: "url", url: "https://example.com" });

function makePreview(id: string, overrides: Partial<AppPreviewProvider> = {}): AppPreviewProvider {
  return {
    id,
    manifestId: id.split(":")[0] ?? id,
    surfaces: ["blog.embed"],
    component: () => Promise.resolve({ default: StubIcon }),
    match: () => ({ args: { id } }),
    ...overrides,
  };
}

function makeApp(id: string, previews: readonly AppPreviewProvider[] = []): AppManifest {
  return {
    id,
    name: id,
    icon: StubIcon,
    category: "productivity",
    component: () => Promise.resolve({ default: StubIcon }),
    previews,
  };
}

describe("kernel.previews (integration)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    await kernel.init();
  });

  afterEach(() => {
    kernel.dispose();
  });

  it("emits preview.registered and preview.unregistered", () => {
    const seenRegistered: Array<{ id: string }> = [];
    const seenUnregistered: Array<{ id: string }> = [];
    const stopRegistered = kernel.events.on("preview.registered", (payload) => {
      seenRegistered.push(payload);
    });
    const stopUnregistered = kernel.events.on("preview.unregistered", (payload) => {
      seenUnregistered.push(payload);
    });

    const dispose = kernel.previews.register(makePreview("plugin:preview"));
    dispose();
    kernel.previews.unregister("missing");

    expect(seenRegistered).toEqual([{ id: "plugin:preview" }]);
    expect(seenUnregistered).toEqual([{ id: "plugin:preview" }]);
    stopRegistered();
    stopUnregistered();
  });

  it("resolves registered providers by surface and priority", () => {
    kernel.previews.register(
      makePreview("low", {
        priority: 10,
        match: () => ({ args: { provider: "low" } }),
      }),
    );
    kernel.previews.register(
      makePreview("high", {
        priority: 200,
        match: () => ({ args: { provider: "high" } }),
      }),
    );

    expect(kernel.previews.resolve(input, { surface: "blog.embed" })).toMatchObject({
      provider: { id: "high" },
      args: { provider: "high" },
    });
  });

  it("registers and removes app-owned previews with the app manifest", () => {
    kernel.apps.register(
      makeApp("preview-app", [
        makePreview("preview-app:card", {
          surfaces: ["finder.panel"],
          manifestId: "ignored",
        }),
      ]),
    );

    expect(kernel.previews.get("preview-app:card")?.manifestId).toBe("preview-app");
    kernel.apps.unregister("preview-app");
    expect(kernel.previews.get("preview-app:card")).toBeUndefined();
  });

  it("re-registering an app replaces its previous preview list", () => {
    kernel.apps.register(
      makeApp("preview-replace", [
        makePreview("preview-replace:old"),
        makePreview("preview-replace:shared", { title: "Shared v1" }),
      ]),
    );

    kernel.apps.register(
      makeApp("preview-replace", [
        makePreview("preview-replace:shared", { title: "Shared v2" }),
        makePreview("preview-replace:new"),
      ]),
    );

    expect(kernel.previews.get("preview-replace:old")).toBeUndefined();
    expect(kernel.previews.get("preview-replace:shared")?.title).toBe("Shared v2");
    expect(kernel.previews.get("preview-replace:new")).toBeDefined();
  });

  it("skips app preview ids that are not namespaced by the app id", () => {
    kernel.apps.register(
      makeApp("preview-namespace", [
        makePreview("wrong:preview"),
        makePreview("preview-namespace:preview"),
      ]),
    );

    expect(kernel.previews.get("wrong:preview")).toBeUndefined();
    expect(kernel.previews.get("preview-namespace:preview")).toBeDefined();
    expect(debugWarn).toHaveBeenCalledWith(
      "[kernel]",
      "skipping app preview with invalid namespace",
      "preview-namespace",
      "wrong:preview",
    );
  });
});
