import { describe, expect, it } from "vitest";

import { WallpaperRegistry, WallpaperRegistryRejectionError } from "./WallpaperRegistry";
import type { WallpaperManifest } from "~/types/wallpaper";

function makeManifest(id: string, overrides: Partial<WallpaperManifest> = {}): WallpaperManifest {
  return {
    id,
    name: id,
    type: "solid",
    value: "#ff00ff",
    ...overrides,
  };
}

describe("WallpaperRegistry — class (M3.4)", () => {
  describe("register", () => {
    it("adds the manifest and exposes it via has/get/list", () => {
      const registry = new WallpaperRegistry();
      registry.register(makeManifest("midnight"));

      expect(registry.has("midnight")).toBe(true);
      expect(registry.get("midnight")?.id).toBe("midnight");
      expect(registry.list().map((m) => m.id)).toEqual(["midnight"]);
    });

    it("UPSERTs on re-register of same id (no throw, replaces manifest)", () => {
      const registry = new WallpaperRegistry();
      const first = makeManifest("midnight", { name: "Midnight v1" });
      const second = makeManifest("midnight", { name: "Midnight v2" });

      registry.register(first);
      registry.register(second);

      expect(registry.get("midnight")).toBe(second);
      expect(registry.list()).toHaveLength(1);
    });

    it("preserves insertion-order slot on UPSERT (no jump to tail)", () => {
      const registry = new WallpaperRegistry();
      registry.register(makeManifest("a"));
      registry.register(makeManifest("b"));
      registry.register(makeManifest("c"));

      // Re-register `a` — should stay first; UPSERT must not move it.
      registry.register(makeManifest("a", { name: "a v2" }));

      expect(registry.list().map((m) => m.id)).toEqual(["a", "b", "c"]);
    });

    it("returns a disposer that removes the manifest", () => {
      const registry = new WallpaperRegistry();
      const dispose = registry.register(makeManifest("disposable"));

      expect(registry.has("disposable")).toBe(true);
      dispose();
      expect(registry.has("disposable")).toBe(false);
    });

    it("disposer is identity-checked: stale disposer is a no-op after UPSERT", () => {
      const registry = new WallpaperRegistry();
      const original = makeManifest("a");
      const dispose = registry.register(original);

      const replacement = makeManifest("a", { name: "replacement" });
      registry.register(replacement);

      dispose();

      expect(registry.has("a")).toBe(true);
      expect(registry.get("a")).toBe(replacement);
    });
  });

  describe("userBlobKey rejection", () => {
    it("throws WallpaperRegistryRejectionError when userBlobKey is a real value", () => {
      const registry = new WallpaperRegistry();
      const offending = {
        ...makeManifest("user-upload"),
        userBlobKey: "blob:abcdef",
      } as WallpaperManifest;

      expect(() => registry.register(offending)).toThrow(WallpaperRegistryRejectionError);
      expect(registry.has("user-upload")).toBe(false);
    });

    it("error carries the offending id and the reason", () => {
      const registry = new WallpaperRegistry();
      const offending = {
        ...makeManifest("user-upload"),
        userBlobKey: "blob:abcdef",
      } as WallpaperManifest;

      try {
        registry.register(offending);
        expect.fail("expected registration to throw");
      } catch (e) {
        expect(e).toBeInstanceOf(WallpaperRegistryRejectionError);
        const err = e as WallpaperRegistryRejectionError;
        expect(err.id).toBe("user-upload");
        expect(err.reason).toBe("user-blob-key-not-allowed");
        expect(err.name).toBe("WallpaperRegistryRejectionError");
        expect(err.message).toContain("user-upload");
      }
    });

    it("tolerates `userBlobKey: undefined` (spread from optional field)", () => {
      const registry = new WallpaperRegistry();
      const benign = {
        ...makeManifest("safe"),
        userBlobKey: undefined,
      } as WallpaperManifest;

      expect(() => registry.register(benign)).not.toThrow();
      expect(registry.has("safe")).toBe(true);
    });

    it('tolerates `userBlobKey: ""` (empty string treated as unset)', () => {
      const registry = new WallpaperRegistry();
      const benign = {
        ...makeManifest("safe"),
        userBlobKey: "",
      } as WallpaperManifest;

      expect(() => registry.register(benign)).not.toThrow();
      expect(registry.has("safe")).toBe(true);
    });
  });

  describe("unregister", () => {
    it("returns true when an entry was actually removed", () => {
      const registry = new WallpaperRegistry();
      registry.register(makeManifest("a"));

      expect(registry.unregister("a")).toBe(true);
      expect(registry.has("a")).toBe(false);
    });

    it("returns false for an unknown id (façade uses this to gate emit)", () => {
      const registry = new WallpaperRegistry();

      expect(registry.unregister("never-registered")).toBe(false);
    });
  });

  describe("list", () => {
    it("returns manifests in registration order", () => {
      const registry = new WallpaperRegistry();
      registry.register(makeManifest("first"));
      registry.register(makeManifest("second"));
      registry.register(makeManifest("third"));

      expect(registry.list().map((m) => m.id)).toEqual(["first", "second", "third"]);
    });

    it("returns a frozen array (callers cannot mutate the registry by reference)", () => {
      const registry = new WallpaperRegistry();
      registry.register(makeManifest("a"));
      const list = registry.list();

      expect(Object.isFrozen(list)).toBe(true);
      expect(() => {
        (list as WallpaperManifest[]).push(makeManifest("smuggled"));
      }).toThrow(TypeError);
    });
  });

  describe("__resetForTests", () => {
    it("clears the registry", () => {
      const registry = new WallpaperRegistry();
      registry.register(makeManifest("a"));
      registry.register(makeManifest("b"));

      registry.__resetForTests();

      expect(registry.list()).toHaveLength(0);
      expect(registry.has("a")).toBe(false);
    });
  });
});
