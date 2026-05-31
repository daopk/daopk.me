import { describe, expect, it } from "vitest";

import { BUILTIN_APP_IDS } from "~/core/apps/builtinAppIds";

import { appStoreManifest } from "./manifest";

describe("appStoreManifest", () => {
  it("registers a visible, singleton productivity app", () => {
    expect(appStoreManifest.id).toBe("app-store");
    expect(appStoreManifest.name).toBe("App Store");
    expect(appStoreManifest.version).toBe("1.0.0");
    expect(appStoreManifest.category).toBe("productivity");
    expect(appStoreManifest.hidden).toBeUndefined();
    expect(appStoreManifest.singleton).toBe(true);
  });

  it("reserves its id so external apps cannot shadow it", () => {
    expect(BUILTIN_APP_IDS.has(appStoreManifest.id)).toBe(true);
  });
});
