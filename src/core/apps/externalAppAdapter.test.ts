import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { isVNode } from "vue";

import type { ExternalAppManifest } from "~/types/externalApp";

import { externalToAppManifest } from "./externalAppAdapter";

function external(overrides: Partial<ExternalAppManifest> = {}): ExternalAppManifest {
  return {
    id: "hello-world",
    name: "Hello World",
    version: "1.2.3",
    category: "productivity",
    entry: "https://apps.example.com/hello/app.mjs",
    icon: { type: "url", src: "https://apps.example.com/hello/icon.png" },
    ...overrides,
  };
}

describe("externalToAppManifest", () => {
  it("maps the core fields through to a runtime AppManifest", () => {
    const manifest = externalToAppManifest(external());
    expect(manifest.id).toBe("hello-world");
    expect(manifest.name).toBe("Hello World");
    expect(manifest.version).toBe("1.2.3");
    expect(manifest.category).toBe("productivity");
    expect(typeof manifest.component).toBe("function");
  });

  it("never sets autorun (external apps cannot auto-launch)", () => {
    const manifest = externalToAppManifest(external());
    expect(manifest.autorun).toBeUndefined();
  });

  it("copies optional fields by value (not by reference)", () => {
    const ext = external({
      permissions: ["network.fetch"],
      defaultWindow: { width: 400, height: 300 },
      keywords: ["hi", "demo"],
      singleton: true,
    });
    const manifest = externalToAppManifest(ext);
    expect(manifest.permissions).toEqual(["network.fetch"]);
    expect(manifest.permissions).not.toBe(ext.permissions);
    expect(manifest.defaultWindow).toEqual({ width: 400, height: 300 });
    expect(manifest.defaultWindow).not.toBe(ext.defaultWindow);
    expect(manifest.keywords).toEqual(["hi", "demo"]);
    expect(manifest.singleton).toBe(true);
  });

  it("omits optional fields when the external manifest does not declare them", () => {
    const manifest = externalToAppManifest(external());
    expect(manifest.permissions).toBeUndefined();
    expect(manifest.defaultWindow).toBeUndefined();
    expect(manifest.keywords).toBeUndefined();
    expect(manifest.singleton).toBeUndefined();
  });

  it("builds an icon component that renders a no-referrer <img> for url icons", () => {
    const manifest = externalToAppManifest(external());
    expect(isVNode(manifest.icon)).toBe(false);

    const wrapper = mount(manifest.icon);
    const img = wrapper.find("img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe("https://apps.example.com/hello/icon.png");
    expect(img.attributes("referrerpolicy")).toBe("no-referrer");
    expect(img.attributes("alt")).toBe("Hello World");
    wrapper.unmount();
  });
});
