import { describe, expect, it } from "vitest";

import { validateExternalManifest } from "./externalManifest";

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

describe("validateExternalManifest", () => {
  it("accepts a minimal valid manifest and returns a cleaned copy", () => {
    const result = validateExternalManifest(valid());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest).toEqual({
      id: "hello-world",
      name: "Hello World",
      version: "1.2.3",
      category: "productivity",
      entry: "https://apps.example.com/hello/app.mjs",
      icon: { type: "url", src: "https://apps.example.com/hello/icon.png" },
    });
  });

  it("accepts an iconify icon", () => {
    const result = validateExternalManifest(
      valid({ icon: { type: "iconify", name: "lucide:rocket" } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.icon).toEqual({ type: "iconify", name: "lucide:rocket" });
  });

  it("rejects non-object input", () => {
    expect(validateExternalManifest(null).ok).toBe(false);
    expect(validateExternalManifest("nope").ok).toBe(false);
    expect(validateExternalManifest(42).ok).toBe(false);
  });

  it("rejects malformed ids", () => {
    expect(validateExternalManifest(valid({ id: "Hello" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ id: "has space" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ id: "-leading" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ id: "" })).ok).toBe(false);
  });

  it("rejects reserved (built-in) and underscore-prefixed ids", () => {
    expect(validateExternalManifest(valid({ id: "settings" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ id: "app-store" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ id: "_secret" })).ok).toBe(false);
  });

  it("rejects missing name", () => {
    expect(validateExternalManifest(valid({ name: "" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ name: 123 })).ok).toBe(false);
  });

  it("requires a semver-shaped version", () => {
    expect(validateExternalManifest(valid({ version: "1.0" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ version: "v1" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ version: "" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ version: "2.0.0-beta.1" })).ok).toBe(true);
  });

  it("rejects categories outside the external whitelist (incl. system)", () => {
    expect(validateExternalManifest(valid({ category: "system" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ category: "games" })).ok).toBe(false);
  });

  it("requires an absolute https entry", () => {
    expect(validateExternalManifest(valid({ entry: "http://apps.example.com/a.mjs" })).ok).toBe(
      false,
    );
    expect(validateExternalManifest(valid({ entry: "/relative/a.mjs" })).ok).toBe(false);
    expect(validateExternalManifest(valid({ entry: "ftp://x/a.mjs" })).ok).toBe(false);
  });

  it("rejects bad icons", () => {
    expect(validateExternalManifest(valid({ icon: undefined })).ok).toBe(false);
    expect(
      validateExternalManifest(valid({ icon: { type: "url", src: "http://x/i.png" } })).ok,
    ).toBe(false);
    expect(validateExternalManifest(valid({ icon: { type: "url" } })).ok).toBe(false);
    expect(validateExternalManifest(valid({ icon: { type: "iconify", name: "" } })).ok).toBe(false);
    expect(validateExternalManifest(valid({ icon: { type: "svg" } })).ok).toBe(false);
  });

  it("validates permissions as a subset of the host union and dedupes", () => {
    expect(
      validateExternalManifest(valid({ permissions: ["network.fetch", "telepathy"] })).ok,
    ).toBe(false);
    const ok = validateExternalManifest(
      valid({ permissions: ["network.fetch", "network.fetch", "vfs.read"] }),
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.manifest.permissions).toEqual(["network.fetch", "vfs.read"]);
  });

  it("clamps window dimensions and drops invalid window fields", () => {
    const result = validateExternalManifest(
      valid({ defaultWindow: { width: 5, height: 99999, maximized: "yes", centered: true } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.defaultWindow).toEqual({ width: 240, height: 4096, centered: true });
  });

  it("keeps valid mobile chrome fields and strips invalid nested chrome fields", () => {
    const result = validateExternalManifest(
      valid({
        chrome: {
          mobile: { titlebar: "hidden", toolbar: "floating" },
          desktop: { titlebar: "hidden" },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.chrome).toEqual({ mobile: { titlebar: "hidden" } });

    const invalid = validateExternalManifest(valid({ chrome: { mobile: { titlebar: "gone" } } }));
    expect(invalid.ok).toBe(true);
    if (!invalid.ok) return;
    expect(invalid.manifest.chrome).toBeUndefined();
  });

  it("strips unknown fields including autorun", () => {
    const result = validateExternalManifest(valid({ autorun: true, source: "evil" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("autorun" in result.manifest).toBe(false);
    expect("source" in result.manifest).toBe(false);
  });

  it("caps keywords and drops non-strings", () => {
    const many = Array.from({ length: 50 }, (_, i) => `kw${i}`);
    const result = validateExternalManifest(valid({ keywords: [...many, 7, "", "real"] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.keywords?.length).toBeLessThanOrEqual(20);
  });

  it("keeps an optional string description and rejects non-string descriptions", () => {
    const ok = validateExternalManifest(valid({ description: "A friendly app" }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.manifest.description).toBe("A friendly app");
    expect(validateExternalManifest(valid({ description: 123 })).ok).toBe(false);
  });
});
