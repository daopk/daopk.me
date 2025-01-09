import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { SPOTLIGHT_RECENTS_CAP } from "~/core/storage/constants";

import { useSpotlightRecentsStore } from "./SpotlightRecentsStore";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

describe("SpotlightRecentsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
  });

  afterEach(() => {
    const store = useSpotlightRecentsStore();
    store.dispose();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("starts empty before hydrate", () => {
    const store = useSpotlightRecentsStore();
    expect(store.list()).toEqual([]);
  });

  it("hydrate() restores persisted entries (cleaned + capped)", () => {
    const data = {
      entries: Array.from({ length: SPOTLIGHT_RECENTS_CAP + 5 }, (_, i) => ({
        kind: "command",
        id: `cmd-${i}`,
        usedAt: 1_700_000_000_000 - i,
      })),
    };
    localStorage.setItem("spotlight:state", JSON.stringify({ __v: 1, data }));

    const store = useSpotlightRecentsStore();
    store.hydrate();
    expect(store.list().length).toBe(SPOTLIGHT_RECENTS_CAP);
    expect(store.list()[0]?.id).toBe("cmd-0");
  });

  it("push() inserts a new entry at the head stamped with Date.now()", () => {
    const store = useSpotlightRecentsStore();
    store.hydrate();
    vi.setSystemTime(new Date(1_700_000_000_000));
    store.push("command", "theme:toggle");
    vi.setSystemTime(new Date(1_700_000_001_000));
    store.push("app", "settings");

    const list = store.list();
    expect(list[0]).toEqual({ kind: "app", id: "settings", usedAt: 1_700_000_001_000 });
    expect(list[1]).toEqual({ kind: "command", id: "theme:toggle", usedAt: 1_700_000_000_000 });
  });

  it("push() dedupes by (kind, id) — repushing promotes to head with new timestamp", () => {
    const store = useSpotlightRecentsStore();
    store.hydrate();
    vi.setSystemTime(new Date(1_000));
    store.push("command", "theme:toggle");
    vi.setSystemTime(new Date(2_000));
    store.push("command", "finder:open");
    vi.setSystemTime(new Date(3_000));
    store.push("command", "theme:toggle");

    const list = store.list();
    expect(list.length).toBe(2);
    expect(list[0]).toEqual({ kind: "command", id: "theme:toggle", usedAt: 3_000 });
    expect(list[1]).toEqual({ kind: "command", id: "finder:open", usedAt: 2_000 });
  });

  it("dedupe is per-kind — same id under different kinds coexist", () => {
    const store = useSpotlightRecentsStore();
    store.hydrate();
    vi.setSystemTime(new Date(1_000));
    store.push("command", "settings");
    vi.setSystemTime(new Date(2_000));
    store.push("app", "settings");

    expect(store.list().length).toBe(2);
  });

  it("evicts the oldest entry when cap is reached (FIFO at the tail)", () => {
    const store = useSpotlightRecentsStore();
    store.hydrate();
    for (let i = 0; i < SPOTLIGHT_RECENTS_CAP + 3; i++) {
      vi.setSystemTime(new Date(1_000 + i));
      store.push("command", `cmd-${i}`);
    }
    const list = store.list();
    expect(list.length).toBe(SPOTLIGHT_RECENTS_CAP);
    expect(list[0]?.id).toBe(`cmd-${SPOTLIGHT_RECENTS_CAP + 2}`);
    expect(list.at(-1)?.id).toBe(`cmd-3`);
  });

  it("clear() empties the list and persists", () => {
    const store = useSpotlightRecentsStore();
    store.hydrate();
    store.push("command", "theme:toggle");
    store.clear();
    expect(store.list()).toEqual([]);
  });

  it("clear() is a no-op when already empty (does not write)", () => {
    const store = useSpotlightRecentsStore();
    store.hydrate();
    expect(() => store.clear()).not.toThrow();
    expect(localStorage.getItem("spotlight:state")).toBeNull();
  });

  it("push() persists to localStorage under the dedicated `spotlight:state` namespace", () => {
    const store = useSpotlightRecentsStore();
    store.hydrate();
    vi.setSystemTime(new Date(5_000));
    store.push("command", "theme:toggle");

    const raw = localStorage.getItem("spotlight:state");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.__v).toBe(1);
    expect(parsed.data.entries[0]).toEqual({
      kind: "command",
      id: "theme:toggle",
      usedAt: 5_000,
    });
  });

  it("push() returns the inserted entry; clear() fires the onChanged hook", () => {
    const onChanged = vi.fn();
    const store = useSpotlightRecentsStore();
    store.hydrate({ onChanged });

    onChanged.mockClear();
    const inserted = store.push("command", "theme:toggle");
    expect(inserted).toEqual({
      kind: "command",
      id: "theme:toggle",
      usedAt: 1_700_000_000_000,
    });
    expect(onChanged).toHaveBeenCalledTimes(1);

    store.clear();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("hydrate() coerces away malformed entries (missing fields, wrong kind)", () => {
    localStorage.setItem(
      "spotlight:state",
      JSON.stringify({
        __v: 1,
        data: {
          entries: [
            { kind: "command", id: "ok", usedAt: 1_000 },
            { kind: "widget", id: "bad-kind", usedAt: 1_000 },
            { kind: "command", id: "", usedAt: 1_000 },
            { kind: "command", id: "no-stamp" },
            { kind: "command", id: "non-finite", usedAt: Number.POSITIVE_INFINITY },
            null,
            { kind: "app", id: "ok-app", usedAt: 2_000 },
          ],
        },
      }),
    );

    const store = useSpotlightRecentsStore();
    store.hydrate();
    const list = store.list();
    expect(list.map((e) => e.id)).toEqual(["ok", "ok-app"]);
  });

  it("dispose() tears down the KV listener; post-dispose push is a hard no-op", () => {
    const store = useSpotlightRecentsStore();
    store.hydrate();
    store.push("command", "x");
    store.dispose();

    const result = store.push("command", "y");
    expect(result).toBeNull();
    expect(store.list().map((e) => e.id)).toEqual(["x"]);

    store.hydrate();
    expect(store.list().map((e) => e.id)).toEqual(["x"]);
  });
});
