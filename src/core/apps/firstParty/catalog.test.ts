import { describe, expect, it, vi } from "vitest";

import { coerceFirstPartyCatalog } from "./catalog";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

const notesManifest = {
  id: "notes",
  name: "Notes",
  icon: "NotesAppIcon",
  category: "productivity",
  permissions: ["vfs.read", "vfs.write"],
  defaultWindow: { width: 920, height: 620, centered: true },
  keywords: ["notes", "markdown"],
};

describe("first-party catalog coercion", () => {
  it("keeps build metadata and validated app manifests for release-pinned entries", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            build: 123,
            revision: "abc1234",
            entry: "/apps/notes/1.0.1+123/notes.js",
            manifest: notesManifest,
          },
        ],
      }).apps,
    ).toEqual([
      {
        id: "notes",
        version: "1.0.1",
        build: 123,
        revision: "abc1234",
        entry: "/apps/notes/1.0.1+123/notes.js",
        manifest: notesManifest,
      },
    ]);
  });

  it("keeps legacy entries without build or manifest metadata but marks build zero", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            entry: "/apps/notes/1.0.1/notes.js",
          },
        ],
      }).apps,
    ).toEqual([
      {
        id: "notes",
        version: "1.0.1",
        build: 0,
        entry: "/apps/notes/1.0.1/notes.js",
      },
    ]);
  });

  it("drops entries with invalid build metadata", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            build: -1,
            entry: "/apps/notes/1.0.1/notes.js",
            manifest: notesManifest,
          },
        ],
      }).apps,
    ).toEqual([]);
  });

  it("drops entries outside the configured app namespace", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            entry: "https://example.test/apps/notes/1.0.1/notes.js",
            manifest: notesManifest,
          },
          {
            id: "notes",
            version: "1.0.1",
            entry: "/public/apps/notes/1.0.1/notes.js",
            manifest: notesManifest,
          },
        ],
      }).apps,
    ).toEqual([]);
  });

  it("drops entries whose id is not in the first-party allowlist", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "rogue",
            version: "1.0.0",
            build: 1,
            entry: "/apps/rogue/1.0.0+1/rogue.js",
            manifest: {
              id: "rogue",
              name: "Rogue",
              icon: "NotesAppIcon",
              category: "productivity",
            },
          },
        ],
      }).apps,
    ).toEqual([]);
  });

  it("drops manifests with invalid enum or resolver keys", () => {
    const cases = [
      { permissions: ["vfs.read", "root"] },
      { category: "root" },
      { icon: "MissingIcon" },
      { supportedShells: ["desktop", "tablet"] },
      {
        previews: [
          {
            id: "notes:preview",
            surfaces: ["finder.panel"],
            exportName: "Preview",
            match: "unknown-match",
          },
        ],
      },
      {
        widgets: [
          {
            id: "notes:widget",
            title: "Widget",
            surface: "desktop:wallpaper",
            size: "xl",
            exportName: "Widget",
          },
        ],
      },
    ];

    for (const patch of cases) {
      expect(
        coerceFirstPartyCatalog({
          apps: [
            {
              id: "notes",
              version: "1.0.1",
              build: 1,
              entry: "/apps/notes/1.0.1+1/notes.js",
              manifest: { ...notesManifest, ...patch },
            },
          ],
        }).apps,
      ).toEqual([]);
    }
  });

  it("keeps the first valid entry when duplicates appear", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            build: 1,
            entry: "/apps/notes/1.0.1+1/notes.js",
            manifest: notesManifest,
          },
          {
            id: "notes",
            version: "1.0.2",
            build: 2,
            entry: "/apps/notes/1.0.2+2/notes.js",
            manifest: notesManifest,
          },
        ],
      }).apps,
    ).toHaveLength(1);
  });
});
