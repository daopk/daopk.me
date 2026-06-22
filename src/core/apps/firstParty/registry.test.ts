import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FIRST_PARTY_APP_ID_LIST, isFirstPartyAppId } from "./registry";

/**
 * The shell-owned allowlist (`FIRST_PARTY_APP_ID_LIST`) is the trust boundary
 * for independently-shipped apps. Every entry must correspond to a published
 * `apps/<id>/app.manifest.json` package and vice versa — drift in either
 * direction means an app can't load (missing from the allowlist) or the
 * allowlist trusts an id that no longer ships. This test pins that invariant.
 */
const APPS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../apps");

function publishedAppIds(): string[] {
  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(APPS_DIR, entry.name, "app.manifest.json")),
    )
    .map((entry) => entry.name)
    .sort();
}

describe("first-party app allowlist", () => {
  it("matches the published apps/* directories exactly", () => {
    expect([...FIRST_PARTY_APP_ID_LIST].sort()).toEqual(publishedAppIds());
  });

  it("accepts every published app id and rejects unknown ids", () => {
    for (const id of publishedAppIds()) {
      expect(isFirstPartyAppId(id)).toBe(true);
    }
    expect(isFirstPartyAppId("not-a-real-app")).toBe(false);
  });

  it("each app.manifest.json declares an id matching its directory", () => {
    for (const id of publishedAppIds()) {
      const manifest = JSON.parse(
        readFileSync(join(APPS_DIR, id, "app.manifest.json"), "utf8"),
      ) as { id?: unknown };
      expect(manifest.id).toBe(id);
    }
  });
});
