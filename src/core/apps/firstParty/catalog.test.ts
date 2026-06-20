import { describe, expect, it, vi } from "vitest";

import { coerceFirstPartyCatalog } from "./catalog";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

const notesManifest = {
  id: "notes",
  name: "Notes",
  icon: "icon.svg",
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
        ],
      }).apps,
    ).toEqual([]);
  });

  it("accepts public API app module URLs", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            entry: "/public/apps/notes/1.0.1/notes.js",
            manifest: notesManifest,
          },
        ],
      }).apps,
    ).toEqual([
      {
        id: "notes",
        version: "1.0.1",
        build: 0,
        entry: "/public/apps/notes/1.0.1/notes.js",
        manifest: notesManifest,
      },
    ]);
  });

  it("accepts canonical _api app module URLs", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            entry: "/_api/public/apps/notes/1.0.1/notes.js",
            manifest: notesManifest,
          },
        ],
      }).apps,
    ).toEqual([
      {
        id: "notes",
        version: "1.0.1",
        build: 0,
        entry: "/_api/public/apps/notes/1.0.1/notes.js",
        manifest: notesManifest,
      },
    ]);
  });

  it("accepts production canonical app module URLs", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            entry: "https://daopk.me/_api/public/apps/notes/1.0.1/notes.js",
            manifest: notesManifest,
          },
        ],
      }).apps,
    ).toEqual([
      {
        id: "notes",
        version: "1.0.1",
        build: 0,
        entry: "https://daopk.me/_api/public/apps/notes/1.0.1/notes.js",
        manifest: notesManifest,
      },
    ]);
  });

  it("drops legacy api.daopk.me app module URLs", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            entry: "https://api.daopk.me/public/apps/notes/1.0.1/notes.js",
            manifest: notesManifest,
          },
        ],
      }).apps,
    ).toEqual([]);
  });

  it("keeps validated desktop contribution descriptors", () => {
    const desktop = {
      contextMenu: [
        {
          id: "notes:new-desktop-note",
          label: "New Note",
          surface: "desktop:background",
          group: "create",
          order: 0,
          exportName: "createDesktopNote",
        },
      ],
      renderers: [
        {
          id: "notes:desktop-layer",
          surface: "desktop:wallpaper",
          order: 0,
          exportName: "NotesDesktopLayer",
        },
      ],
    };

    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            build: 1,
            entry: "/apps/notes/1.0.1+1/notes.js",
            manifest: { ...notesManifest, desktop },
          },
        ],
      }).apps[0]?.manifest?.desktop,
    ).toEqual(desktop);
  });

  it("keeps app-owned icon refs and serializable preview match rules", () => {
    const previews = [
      {
        id: "notes:url-preview",
        surfaces: ["blog.embed"],
        exportName: "UrlPreview",
        match: { kind: "app-url" },
      },
      {
        id: "notes:file-preview",
        surfaces: ["finder.panel"],
        priority: 100,
        exportName: "FilePreview",
        match: { kind: "vfs-file-type", fileType: "pdf" },
      },
    ];
    const widgets = [
      {
        id: "notes:widget",
        title: "Widget",
        icon: "widget-icon.svg",
        surface: "desktop:wallpaper",
        size: "md",
        exportName: "Widget",
      },
    ];

    const manifest = coerceFirstPartyCatalog({
      apps: [
        {
          id: "notes",
          version: "1.0.1",
          build: 1,
          entry: "/apps/notes/1.0.1+1/notes.js",
          manifest: { ...notesManifest, previews, widgets },
        },
      ],
    }).apps[0]?.manifest;

    expect(manifest?.icon).toBe("icon.svg");
    expect(manifest?.previews).toEqual(previews);
    expect(manifest?.widgets?.[0]?.icon).toBe("widget-icon.svg");
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
              icon: "icon.svg",
              category: "productivity",
            },
          },
        ],
      }).apps,
    ).toEqual([]);
  });

  it("drops manifests with invalid enum, icon, or match rules", () => {
    const cases = [
      { permissions: ["vfs.read", "root"] },
      { category: "root" },
      // Icon must be a flat, app-owned image filename — no missing extension,
      // no path traversal, no subdirectories, no foreign extensions.
      { icon: "MissingIcon" },
      { icon: "../evil.svg" },
      { icon: "nested/icon.svg" },
      { icon: "icon.exe" },
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
        previews: [
          {
            id: "notes:preview",
            surfaces: ["finder.panel"],
            exportName: "Preview",
            match: { kind: "bogus-rule" },
          },
        ],
      },
      {
        previews: [
          {
            id: "notes:preview",
            surfaces: ["finder.panel"],
            exportName: "Preview",
            match: { kind: "vfs-file-type", fileType: "spreadsheet" },
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
      {
        desktop: {
          contextMenu: [
            {
              id: "notes:new",
              label: "New",
              surface: "desktop:window",
              exportName: "createDesktopNote",
            },
          ],
        },
      },
      {
        desktop: {
          renderers: [
            {
              id: "notes:renderer",
              surface: "desktop:dock",
              exportName: "NotesDesktopLayer",
            },
          ],
        },
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
