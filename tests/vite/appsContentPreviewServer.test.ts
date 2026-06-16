import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildFirstPartyPreviewCatalog } from "../../vite/plugins/appsContentPreviewServer";

const appsRoot = resolve("apps");

describe("buildFirstPartyPreviewCatalog", () => {
  it("synthesizes the preview catalog from first-party app package versions", async () => {
    const catalog = await buildFirstPartyPreviewCatalog(appsRoot);
    const ids = catalog.apps.map((app) => app.id);

    expect(catalog.version).toBe(1);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    expect(ids).not.toContain("_shared");
    expect(ids).not.toContain("html-in-canvas");

    expect(catalog.apps.find((app) => app.id === "notes")).toEqual(
      expect.objectContaining({
        id: "notes",
        version: "1.0.1",
        build: 0,
        entry: "/apps/notes/1.0.1+0/notes.js",
        manifest: expect.objectContaining({ id: "notes", name: "Notes" }),
      }),
    );

    for (const app of catalog.apps) {
      expect(app.build).toBe(0);
      expect(app.entry).toBe(`/apps/${app.id}/${app.version}+0/${app.id}.js`);
      expect(app.manifest).toEqual(expect.objectContaining({ id: app.id }));
    }
  });
});
