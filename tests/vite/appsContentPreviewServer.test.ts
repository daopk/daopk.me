import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFirstPartyPreviewCatalog } from "../../vite/plugins/appsContentPreviewServer";

const appsRoot = resolve("apps");

describe("buildFirstPartyPreviewCatalog", () => {
  it("synthesizes the preview catalog from first-party app package versions", async () => {
    const catalog = await buildFirstPartyPreviewCatalog(appsRoot);
    const ids = catalog.apps.map((app) => app.id);

    expect(catalog.version).toBe(1);
    expect(catalog.apps).toHaveLength(9);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    expect(ids).not.toContain("_shared");

    expect(catalog.apps.find((app) => app.id === "notes")).toEqual({
      id: "notes",
      version: "1.0.1",
      entry: "/apps/notes/1.0.1/notes.js",
    });

    for (const app of catalog.apps) {
      expect(app.entry).toBe(`/apps/${app.id}/${app.version}/${app.id}.js`);
    }
  });
});
