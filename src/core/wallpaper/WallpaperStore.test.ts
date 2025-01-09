import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "fake-indexeddb/auto";

import {
  WALLPAPER_BLOB_CAP_BYTES,
  WALLPAPER_COUNT_CAP,
  WALLPAPERS_KV_NAMESPACE,
  WALLPAPERS_KV_PRIMARY_KEY,
} from "~/core/storage/constants";
import { useWallpaperStore } from "./WallpaperStore";

function makeImageFile(name: string, sizeBytes = 1024): File {
  const bytes = new Uint8Array(sizeBytes).fill(0xff);
  return new File([bytes], name, { type: "image/png" });
}

const PHYSICAL_KEY = `${WALLPAPERS_KV_NAMESPACE}:${WALLPAPERS_KV_PRIMARY_KEY}`;

describe("WallpaperStore (M2b.7)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    try {
      useWallpaperStore().dispose();
    } catch {}
  });

  it("hydrates with an empty index when KV is empty", () => {
    const s = useWallpaperStore();
    s.hydrate();
    expect(s.list()).toEqual([]);
  });

  it("upload round-trip: blob saved + metadata persisted (M2b.7 happy path)", async () => {
    const s = useWallpaperStore();
    s.hydrate();

    const file = makeImageFile("photo.png", 4096);
    const result = await s.upload(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(s.list()).toHaveLength(1);
    expect(s.list()[0]?.id).toBe(result.meta.id);
    expect(s.list()[0]?.name).toBe("photo");

    const blob = await s.getBlob(result.meta.id);
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe("image/png");

    const raw = localStorage.getItem(PHYSICAL_KEY);
    expect(raw).toBeTruthy();
    const envelope = JSON.parse(raw as string) as { data: { index: { id: string }[] } };
    expect(envelope.data.index).toHaveLength(1);
    expect(envelope.data.index[0]?.id).toBe(result.meta.id);
  });

  it("rejects uploads larger than WALLPAPER_BLOB_CAP_BYTES (Q12 — too-large)", async () => {
    const s = useWallpaperStore();
    s.hydrate();

    const file = makeImageFile("huge.png", WALLPAPER_BLOB_CAP_BYTES + 1);
    const result = await s.upload(file);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("too-large");
    expect(s.list()).toHaveLength(0);
  });

  it("rejects non-image MIME types (Q12 — invalid-type)", async () => {
    const s = useWallpaperStore();
    s.hydrate();

    const file = new File([new Uint8Array(128)], "doc.pdf", { type: "application/pdf" });
    const result = await s.upload(file);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid-type");
  });

  it("rejects further uploads once WALLPAPER_COUNT_CAP is reached (Q12 — count-cap)", async () => {
    const s = useWallpaperStore();
    s.hydrate();

    for (let i = 0; i < WALLPAPER_COUNT_CAP; i++) {
      const result = await s.upload(makeImageFile(`p${i}.png`, 256));
      expect(result.ok).toBe(true);
    }
    expect(s.list()).toHaveLength(WALLPAPER_COUNT_CAP);

    const overflow = await s.upload(makeImageFile("overflow.png", 256));
    expect(overflow.ok).toBe(false);
    if (overflow.ok) return;
    expect(overflow.reason).toBe("count-cap");
    expect(s.list()).toHaveLength(WALLPAPER_COUNT_CAP);
  });

  it("remove deletes both the metadata entry and the blob", async () => {
    const s = useWallpaperStore();
    s.hydrate();

    const result = await s.upload(makeImageFile("photo.png", 256));
    if (!result.ok) throw new Error("upload should have succeeded");

    expect(s.has(result.meta.id)).toBe(true);
    expect(await s.getBlob(result.meta.id)).not.toBeNull();

    await s.remove(result.meta.id);
    expect(s.has(result.meta.id)).toBe(false);
    expect(s.list()).toHaveLength(0);
    expect(await s.getBlob(result.meta.id)).toBeNull();
  });

  it("clear wipes both layers", async () => {
    const s = useWallpaperStore();
    s.hydrate();

    await s.upload(makeImageFile("a.png", 128));
    await s.upload(makeImageFile("b.png", 128));
    expect(s.list()).toHaveLength(2);

    await s.clear();
    expect(s.list()).toHaveLength(0);
    const raw = localStorage.getItem(PHYSICAL_KEY);
    const envelope = raw ? (JSON.parse(raw) as { data: { index: unknown[] } }) : null;
    expect(envelope?.data.index).toEqual([]);
  });

  it("hydrates a persisted index from a previous session (M2b.7 cross-session)", () => {
    const fakeIndex = [
      {
        id: "user-abc",
        name: "carry-over",
        sizeBytes: 64,
        mimeType: "image/png",
        createdAt: 1000,
      },
    ];
    localStorage.setItem(PHYSICAL_KEY, JSON.stringify({ __v: 1, data: { index: fakeIndex } }));

    const s = useWallpaperStore();
    s.hydrate();
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0]?.id).toBe("user-abc");
  });

  it("dispose is idempotent and leaves no Pinia state", () => {
    const s = useWallpaperStore();
    s.hydrate();
    s.dispose();
    s.dispose(); // second dispose must not throw
    expect(s.list()).toEqual([]);
  });
});
