import { afterEach, describe, expect, it } from "vitest";

import type { MoviePlaySource } from "./moviesApi";
import {
  createMoviesSourcePreferenceStore,
  MOVIES_SOURCE_PREFERENCE_KV_KEY,
  moviesSourcePreferenceSnapshot,
  type MoviesSourcePreferenceState,
} from "./moviesSourcePreference";

const STORAGE_NAMESPACE = "movies-source-preference-test";
const STORAGE_KEY = `${STORAGE_NAMESPACE}:${MOVIES_SOURCE_PREFERENCE_KV_KEY}`;

function playSource(overrides: Partial<MoviePlaySource> = {}): MoviePlaySource {
  return {
    embedUrl: "https://player.example.test/player/?url=fight-club",
    filename: "fight-club.m3u8",
    m3u8Url: "https://stream.example.test/fight-club/master.m3u8",
    name: "Full",
    serverName: "Server 1",
    slug: "full",
    ...overrides,
  };
}

function readState(): MoviesSourcePreferenceState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    throw new Error("missing movies source preference state");
  }
  return (JSON.parse(raw) as { data: MoviesSourcePreferenceState }).data;
}

describe("moviesSourcePreference", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("builds source preference snapshots without stream-specific URLs", () => {
    expect(
      moviesSourcePreferenceSnapshot(
        playSource({
          filename: "backup.m3u8",
          m3u8Url: "https://stream.example.test/fight-club/backup.m3u8",
          name: "Backup",
          serverName: "Server 2",
          slug: "backup",
        }),
        1,
      ),
    ).toEqual({
      filename: "backup.m3u8",
      index: 1,
      name: "Backup",
      serverName: "Server 2",
      slug: "backup",
    });
  });

  it("persists the last source preference", () => {
    const store = createMoviesSourcePreferenceStore({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const source = moviesSourcePreferenceSnapshot(
      playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }),
      1,
    );

    store.save(source);

    expect(store.get()).toEqual(source);
    expect(readState()).toEqual({
      source,
      updatedAt: 1_000,
    });

    store.dispose();
  });
});
