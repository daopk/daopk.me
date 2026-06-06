import { describe, expect, it, vi } from "vitest";

import { coerceFirstPartyCatalog } from "./catalog";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

describe("first-party catalog coercion", () => {
  it("keeps build metadata for release-pinned entries", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            build: 123,
            revision: "abc1234",
            entry: "/public/apps/notes/1.0.1+123/notes.js",
          },
        ],
      }).apps,
    ).toEqual([
      {
        id: "notes",
        version: "1.0.1",
        build: 123,
        revision: "abc1234",
        entry: "/public/apps/notes/1.0.1+123/notes.js",
      },
    ]);
  });

  it("normalizes legacy entries without build metadata to build zero", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            entry: "/public/apps/notes/1.0.1/notes.js",
          },
        ],
      }).apps,
    ).toEqual([
      {
        id: "notes",
        version: "1.0.1",
        build: 0,
        entry: "/public/apps/notes/1.0.1/notes.js",
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
            entry: "/public/apps/notes/1.0.1/notes.js",
          },
        ],
      }).apps,
    ).toEqual([]);
  });

  it("drops entries outside the configured public API app namespace", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [
          {
            id: "notes",
            version: "1.0.1",
            entry: "https://example.test/public/apps/notes/1.0.1/notes.js",
          },
          {
            id: "notes",
            version: "1.0.1",
            entry: "https://api.daopk.test/apps/notes/1.0.1/notes.js",
          },
        ],
      }).apps,
    ).toEqual([]);
  });
});
