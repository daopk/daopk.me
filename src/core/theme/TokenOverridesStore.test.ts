import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { useTokenOverridesStore } from "~/core/theme/TokenOverridesStore";

const PHYSICAL_KEY = "tokens:state";

function persistedSnapshot(): Record<string, string> | null {
  const raw = localStorage.getItem(PHYSICAL_KEY);
  if (!raw) {
    return null;
  }
  const env = JSON.parse(raw) as { __v: number; data: Record<string, string> };
  return env.data;
}

describe("useTokenOverridesStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    try {
      useTokenOverridesStore().dispose();
    } catch {}
    vi.useRealTimers();
  });

  it("hydrates empty when storage is empty", () => {
    const store = useTokenOverridesStore();
    store.hydrate();

    expect(store.snapshot()).toEqual({});
  });

  it("set persists the override after debounce", () => {
    const store = useTokenOverridesStore();
    store.hydrate();

    store.set("--color-accent", "#abc");

    expect(persistedSnapshot()).toBeNull();
    vi.advanceTimersByTime(250);
    expect(persistedSnapshot()).toEqual({ "--color-accent": "#abc" });
  });

  it("set is a no-op when the value is unchanged (dedupe)", () => {
    const store = useTokenOverridesStore();
    const onChanged = vi.fn();
    store.hydrate({ onTokensChanged: onChanged });

    store.set("--color-accent", "#abc");
    onChanged.mockClear();
    store.set("--color-accent", "#abc");

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("rejects keys that do not start with -- (defense at boundary)", () => {
    const store = useTokenOverridesStore();
    store.hydrate();

    store.set("color-accent", "#abc"); // missing `--` prefix
    expect(store.snapshot()).toEqual({});
  });

  it("unset removes the key and fires the change hook", () => {
    const store = useTokenOverridesStore();
    const onChanged = vi.fn();
    store.hydrate({ onTokensChanged: onChanged });

    store.set("--color-accent", "#abc");
    onChanged.mockClear();

    store.unset("--color-accent");
    expect(store.snapshot()).toEqual({});
    expect(onChanged).toHaveBeenCalledWith(["--color-accent"]);
  });

  it("setMany applies multiple overrides atomically and fires one hook call", () => {
    const store = useTokenOverridesStore();
    const onChanged = vi.fn();
    store.hydrate({ onTokensChanged: onChanged });

    store.setMany({
      "--color-accent": "#abc",
      "--radius-md": "12px",
      "ignored-key": "nope",
    });

    expect(store.snapshot()).toEqual({
      "--color-accent": "#abc",
      "--radius-md": "12px",
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged.mock.calls[0]?.[0]?.sort()).toEqual(["--color-accent", "--radius-md"]);
  });

  it("reset clears every override and reports the keys that were cleared", () => {
    const store = useTokenOverridesStore();
    const onChanged = vi.fn();
    store.hydrate({ onTokensChanged: onChanged });

    store.setMany({ "--color-accent": "#abc", "--space-md": "16px" });
    onChanged.mockClear();

    store.reset();

    expect(store.snapshot()).toEqual({});
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged.mock.calls[0]?.[0]?.sort()).toEqual(["--color-accent", "--space-md"]);
  });

  it("hydrates persisted snapshot from localStorage", () => {
    localStorage.setItem(
      PHYSICAL_KEY,
      JSON.stringify({ __v: 1, data: { "--color-accent": "#abc" } }),
    );

    const store = useTokenOverridesStore();
    store.hydrate();

    expect(store.snapshot()).toEqual({ "--color-accent": "#abc" });
  });

  it("coerceOverrides strips non-CSS keys and non-string values on hydrate", () => {
    localStorage.setItem(
      PHYSICAL_KEY,
      JSON.stringify({
        __v: 1,
        data: {
          "--color-accent": "#abc",
          "bare-key": "bad",
          "--ok": 42,
        },
      }),
    );

    const store = useTokenOverridesStore();
    store.hydrate();

    expect(store.snapshot()).toEqual({ "--color-accent": "#abc" });
  });

  it("flush writes immediately, bypassing the debounce", async () => {
    const store = useTokenOverridesStore();
    store.hydrate();

    store.set("--color-accent", "#abc");
    await nextTick();
    expect(persistedSnapshot()).toBeNull();

    store.flush();
    expect(persistedSnapshot()).toEqual({ "--color-accent": "#abc" });
  });

  it("dispose persists pending writes immediately", () => {
    const store = useTokenOverridesStore();
    store.hydrate();

    store.set("--radius-md", "10px");
    expect(persistedSnapshot()).toBeNull();

    store.dispose();
    expect(persistedSnapshot()).toEqual({ "--radius-md": "10px" });
  });

  it("reset is a silent no-op when the overrides map is empty", () => {
    const store = useTokenOverridesStore();
    const onChanged = vi.fn();
    store.hydrate({ onTokensChanged: onChanged });

    store.reset();

    expect(onChanged).not.toHaveBeenCalled();
    expect(store.snapshot()).toEqual({});
  });

  it("cross-tab storage event triggers onStorageSynced + applies the remote payload", () => {
    const store = useTokenOverridesStore();
    const onSynced = vi.fn();
    const onChanged = vi.fn();
    store.hydrate({ onStorageSynced: onSynced, onTokensChanged: onChanged });

    // current window when localStorage mutates from script — but not for
    localStorage.setItem(
      PHYSICAL_KEY,
      JSON.stringify({ __v: 1, data: { "--color-accent": "#abc" } }),
    );

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PHYSICAL_KEY,
        newValue: localStorage.getItem(PHYSICAL_KEY),
        oldValue: null,
        storageArea: localStorage,
      }),
    );

    expect(onSynced).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith(["--color-accent"]);
    expect(store.snapshot()).toEqual({ "--color-accent": "#abc" });
  });
});
