import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";

import { createPersistedState, type PersistedState } from "~/core/storage/createPersistedState";

const PRIMARY_KEY = "state";

function readPersistedNumber(namespace: string): number | null {
  const raw = localStorage.getItem(`${namespace}:${PRIMARY_KEY}`);
  if (raw === null) {
    return null;
  }
  return (JSON.parse(raw) as { data: number }).data;
}

describe("createPersistedState", () => {
  const active: PersistedState[] = [];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    for (const persistence of active.splice(0)) {
      persistence.dispose();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function makeNumberState(options?: {
    debounceMs?: number;
    ignoreMissingRemote?: boolean;
    onRemoteReconciled?: () => void;
  }): {
    value: ReturnType<typeof ref<number>>;
    persistence: PersistedState;
  } {
    const value = ref(0);
    const persistence = createPersistedState<number>({
      primaryKey: PRIMARY_KEY,
      ...(options?.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
      snapshot: () => value.value,
      resolve: (candidate, origin) =>
        candidate === null && origin === "remote" && options?.ignoreMissingRemote
          ? undefined
          : {
              value: typeof candidate === "number" ? candidate : 0,
            },
      apply: (next) => {
        value.value = next;
      },
      ...(options?.onRemoteReconciled === undefined
        ? {}
        : { onRemoteReconciled: options.onRemoteReconciled }),
    });
    active.push(persistence);
    return { value, persistence };
  }

  it("hydrates, watches and disposes through one interface", () => {
    localStorage.setItem("numbers:state", JSON.stringify({ __v: 1, data: 4 }));
    const { value, persistence } = makeNumberState();

    persistence.hydrate("numbers");
    expect(persistence.isHydrated).toBe(true);
    expect(value.value).toBe(4);

    value.value = 5;
    expect(readPersistedNumber("numbers")).toBe(5);

    persistence.dispose();
    expect(persistence.isHydrated).toBe(false);
    value.value = 6;
    expect(readPersistedNumber("numbers")).toBe(5);
  });

  it("keeps watching after the caller's effect scope stops", () => {
    const { value, persistence } = makeNumberState();
    const callerScope = effectScope();

    callerScope.run(() => {
      persistence.hydrate("detached");
    });
    callerScope.stop();

    expect(persistence.isHydrated).toBe(true);
    value.value = 5;
    expect(readPersistedNumber("detached")).toBe(5);

    persistence.dispose();
    expect(persistence.isHydrated).toBe(false);
    value.value = 6;
    expect(readPersistedNumber("detached")).toBe(5);
  });

  it("debounces writes and lets flush bypass the delay", () => {
    vi.useFakeTimers();
    const { value, persistence } = makeNumberState({ debounceMs: 250 });
    persistence.hydrate("debounced");

    value.value = 1;
    vi.advanceTimersByTime(249);
    expect(readPersistedNumber("debounced")).toBeNull();

    vi.advanceTimersByTime(1);
    expect(readPersistedNumber("debounced")).toBe(1);

    value.value = 2;
    persistence.flush();
    expect(readPersistedNumber("debounced")).toBe(2);
  });

  it("flushes pending writes when the page is hidden or disposed", () => {
    vi.useFakeTimers();
    const { value, persistence } = makeNumberState({ debounceMs: 250 });
    persistence.hydrate("lifecycle");

    value.value = 1;
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    expect(readPersistedNumber("lifecycle")).toBe(1);

    value.value = 2;
    persistence.dispose();
    expect(readPersistedNumber("lifecycle")).toBe(2);
  });

  it("reconciles remote state without echoing it back to storage", () => {
    const onRemoteReconciled = vi.fn();
    const { value, persistence } = makeNumberState({ onRemoteReconciled });
    persistence.hydrate("remote");

    localStorage.setItem("remote:state", JSON.stringify({ __v: 1, data: 7 }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "remote:state",
        newValue: JSON.stringify({ __v: 1, data: 7 }),
        storageArea: localStorage,
      }),
    );

    expect(value.value).toBe(7);
    expect(onRemoteReconciled).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("preserves a pending write when a missing remote snapshot is ignored", () => {
    vi.useFakeTimers();
    localStorage.setItem("ignored-remote:state", JSON.stringify({ __v: 1, data: 1 }));
    const onRemoteReconciled = vi.fn();
    const { value, persistence } = makeNumberState({
      debounceMs: 250,
      ignoreMissingRemote: true,
      onRemoteReconciled,
    });
    persistence.hydrate("ignored-remote");

    value.value = 2;
    vi.advanceTimersByTime(100);
    localStorage.removeItem("ignored-remote:state");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "ignored-remote:state",
        oldValue: JSON.stringify({ __v: 1, data: 1 }),
        newValue: null,
        storageArea: localStorage,
      }),
    );

    expect(value.value).toBe(2);
    expect(onRemoteReconciled).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(149);
    expect(readPersistedNumber("ignored-remote")).toBeNull();

    vi.advanceTimersByTime(1);
    expect(readPersistedNumber("ignored-remote")).toBe(2);
  });

  it("rewrites a migrated snapshot during hydration", () => {
    localStorage.setItem("migrated:state", JSON.stringify({ __v: 1, data: 4.8 }));
    const value = ref(0);
    const persistence = createPersistedState<number>({
      primaryKey: PRIMARY_KEY,
      snapshot: () => value.value,
      resolve: (candidate) => ({
        value: typeof candidate === "number" ? Math.floor(candidate) : 0,
        rewrite: true,
      }),
      apply: (next) => {
        value.value = next;
      },
    });
    active.push(persistence);

    persistence.hydrate("migrated");

    expect(value.value).toBe(4);
    expect(readPersistedNumber("migrated")).toBe(4);
  });

  it("does not overwrite a newer external snapshot when no write is pending", () => {
    const { persistence } = makeNumberState();
    persistence.hydrate("external-write");
    localStorage.setItem("external-write:state", JSON.stringify({ __v: 1, data: 9 }));

    persistence.dispose();

    expect(readPersistedNumber("external-write")).toBe(9);
  });

  it("flushes the old namespace before rehydrating a new one", () => {
    vi.useFakeTimers();
    const { value, persistence } = makeNumberState({ debounceMs: 250 });
    persistence.hydrate("profile-a");
    value.value = 3;

    persistence.hydrate("profile-b");

    expect(readPersistedNumber("profile-a")).toBe(3);
    expect(value.value).toBe(0);
    value.value = 8;
    vi.advanceTimersByTime(250);
    expect(readPersistedNumber("profile-b")).toBe(8);
  });
});
