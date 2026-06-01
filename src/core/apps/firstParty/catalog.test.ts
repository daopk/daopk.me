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
            entry: "/apps/notes/1.0.1+123/notes.js",
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
      },
    ]);
  });

  it("normalizes legacy entries without build metadata to build zero", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [{ id: "notes", version: "1.0.1", entry: "/apps/notes/1.0.1/notes.js" }],
      }).apps,
    ).toEqual([{ id: "notes", version: "1.0.1", build: 0, entry: "/apps/notes/1.0.1/notes.js" }]);
  });

  it("drops entries with invalid build metadata", () => {
    expect(
      coerceFirstPartyCatalog({
        apps: [{ id: "notes", version: "1.0.1", build: -1, entry: "/apps/notes/1.0.1/notes.js" }],
      }).apps,
    ).toEqual([]);
  });
});
