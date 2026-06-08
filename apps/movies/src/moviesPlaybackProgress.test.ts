import { afterEach, describe, expect, it } from "vitest";

import {
  createMoviesPlaybackProgressStore,
  episodePlaybackProgressKey,
  moviePlaybackProgressKey,
  MOVIES_PLAYBACK_PROGRESS_KV_KEY,
  type MoviesPlaybackProgressState,
} from "./moviesPlaybackProgress";

const STORAGE_NAMESPACE = "movies-progress-test";
const STORAGE_KEY = `${STORAGE_NAMESPACE}:${MOVIES_PLAYBACK_PROGRESS_KV_KEY}`;

function persistRaw(data: unknown): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: 1, data }));
}

function readState(): MoviesPlaybackProgressState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    throw new Error("missing movies playback progress state");
  }
  return (JSON.parse(raw) as { data: MoviesPlaybackProgressState }).data;
}

describe("moviesPlaybackProgress", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("builds stable movie and episode progress keys", () => {
    expect(moviePlaybackProgressKey(550)).toBe("movie:550");
    expect(episodePlaybackProgressKey(1399, 1, 2)).toBe("tv:1399:s1:e2");
  });

  it("loads empty progress state and persists valid entries", () => {
    const store = createMoviesPlaybackProgressStore({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });

    expect(store.snapshot()).toEqual({ entries: {} });

    store.save(moviePlaybackProgressKey(550), { currentTime: 42, duration: 120 });

    expect(store.get(moviePlaybackProgressKey(550))).toEqual({
      currentTime: 42,
      duration: 120,
      updatedAt: 1_000,
    });
    expect(readState()).toEqual(store.snapshot());

    store.dispose();
  });

  it("hydrates valid persisted entries", () => {
    persistRaw({
      entries: {
        [moviePlaybackProgressKey(550)]: {
          currentTime: 30,
          duration: 120,
          updatedAt: 2_000,
        },
      },
    });

    const store = createMoviesPlaybackProgressStore({
      now: () => 3_000,
      storageNamespace: STORAGE_NAMESPACE,
    });

    expect(store.get(moviePlaybackProgressKey(550))).toEqual({
      currentTime: 30,
      duration: 120,
      updatedAt: 2_000,
    });

    store.dispose();
  });

  it("rejects invalid, stale, and near-end progress entries", () => {
    const now = 1000 * 60 * 60 * 24 * 181;
    persistRaw({
      entries: {
        invalid: { currentTime: 2, duration: 120, updatedAt: now },
        nearEnd: { currentTime: 116, duration: 120, updatedAt: now },
        stale: { currentTime: 30, duration: 120, updatedAt: 1 },
        valid: { currentTime: 30, duration: 120, updatedAt: now },
      },
    });

    const store = createMoviesPlaybackProgressStore({
      now: () => now,
      storageNamespace: STORAGE_NAMESPACE,
    });

    expect(store.snapshot()).toEqual({
      entries: {
        valid: { currentTime: 30, duration: 120, updatedAt: now },
      },
    });
    expect(readState()).toEqual(store.snapshot());

    store.dispose();
  });

  it("clears saved progress", () => {
    const store = createMoviesPlaybackProgressStore({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });

    store.save(moviePlaybackProgressKey(550), { currentTime: 42, duration: 120 });
    store.clear(moviePlaybackProgressKey(550));

    expect(store.get(moviePlaybackProgressKey(550))).toBeNull();
    expect(readState()).toEqual({ entries: {} });

    store.dispose();
  });

  it("prunes overflow entries to the most recent progress records", () => {
    persistRaw({
      entries: Object.fromEntries(
        Array.from({ length: 205 }, (_value, index) => [
          `movie:${index + 1}`,
          { currentTime: 30, duration: 120, updatedAt: index + 1 },
        ]),
      ),
    });

    const store = createMoviesPlaybackProgressStore({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const entries = store.snapshot().entries;

    expect(Object.keys(entries)).toHaveLength(200);
    expect(entries["movie:1"]).toBeUndefined();
    expect(entries["movie:205"]).toEqual({
      currentTime: 30,
      duration: 120,
      updatedAt: 205,
    });

    store.dispose();
  });
});
