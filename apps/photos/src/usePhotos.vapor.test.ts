import { describe, expect, it, vi } from "vitest";

import { debugWarn } from "@daopk/sdk";
import { mountVaporComposable } from "~/test/mountVapor";

import { PHOTOS_CONTENT_BASE } from "./photosContentConfig";
import { photoFromEntry, usePhotos, type Photo } from "./usePhotos";

vi.mock("@daopk/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@daopk/sdk")>()),
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

function photo(overrides: Partial<Photo> & { key: string }): Photo {
  return {
    url: `/public/photos/${overrides.key}`,
    size: 0,
    uploaded: null,
    contentType: "image/jpeg",
    ...overrides,
  };
}

function mountHarness(fetchIndex: () => Promise<readonly Photo[]>) {
  const mounted = mountVaporComposable(() => usePhotos({ fetchIndex }));

  return {
    state: mounted.result,
    wrapper: mounted.wrapper,
  };
}

describe("photoFromEntry", () => {
  it("parses a complete worker index entry", () => {
    expect(
      photoFromEntry({
        key: "ocean.png",
        url: "/public/photos/ocean.png",
        size: 1234,
        uploaded: "2026-05-31T12:00:00.000Z",
        contentType: "image/png",
      }),
    ).toEqual({
      key: "ocean.png",
      url: `${PHOTOS_CONTENT_BASE}/ocean.png`,
      size: 1234,
      uploaded: "2026-05-31T12:00:00.000Z",
      contentType: "image/png",
    });
  });

  it("preserves absolute URLs from the worker index", () => {
    expect(
      photoFromEntry({
        key: "ocean.png",
        url: "https://cdn.daopk.test/photos/ocean.png",
      }),
    ).toEqual(
      expect.objectContaining({
        key: "ocean.png",
        url: "https://cdn.daopk.test/photos/ocean.png",
      }),
    );
  });

  it("rejects non-objects and entries without a key", () => {
    expect(photoFromEntry(null)).toBeNull();
    expect(photoFromEntry("nope")).toBeNull();
    expect(photoFromEntry({ size: 1 })).toBeNull();
  });

  it("fills sensible defaults from a minimal entry", () => {
    expect(photoFromEntry({ key: "a.jpg" })).toEqual({
      key: "a.jpg",
      url: `${PHOTOS_CONTENT_BASE}/a.jpg`,
      size: 0,
      uploaded: null,
      contentType: "application/octet-stream",
    });
  });
});

describe("usePhotos", () => {
  it("loads photos into a ready gallery", async () => {
    const { state } = mountHarness(
      vi.fn(async () => [
        photo({ key: "a.jpg" }),
        photo({ key: "b.png", contentType: "image/png" }),
      ]),
    );

    await vi.waitFor(() => {
      expect(state.status.value).toBe("ready");
    });

    expect(state.photos.value.map((entry) => entry.key)).toEqual(["a.jpg", "b.png"]);
  });

  it("marks an empty index as empty", async () => {
    const { state } = mountHarness(vi.fn(async () => []));

    await vi.waitFor(() => {
      expect(state.empty.value).toBe(true);
    });
  });

  it("flags an error and logs when the index fails to load", async () => {
    const { state } = mountHarness(
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    await vi.waitFor(() => {
      expect(state.loadFailed.value).toBe(true);
    });

    expect(debugWarn).toHaveBeenCalledWith(
      "[photos] failed to load gallery index",
      expect.anything(),
    );
  });
});
