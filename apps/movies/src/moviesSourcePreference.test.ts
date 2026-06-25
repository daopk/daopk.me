import { afterEach, describe, expect, it } from "vitest";

import type { MoviePlaySource } from "./moviesApi";
import {
  createMoviesSourcePreferenceStore,
  MOVIES_SOURCE_PREFERENCE_KV_KEY,
  moviesSourcePreferenceSnapshot,
  resolveMoviesPreferredSourceIndex,
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

  it("resolves source preference by slug and server name before slug-only matches", () => {
    const preference = moviesSourcePreferenceSnapshot(
      playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }),
      1,
    );

    expect(
      resolveMoviesPreferredSourceIndex(preference, [
        playSource({ name: "Backup", serverName: "Server 1", slug: "backup" }),
        playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }),
      ]),
    ).toBe(1);
  });

  it("falls back from slug plus server name to slug-only matches", () => {
    const preference = moviesSourcePreferenceSnapshot(
      playSource({ name: "Backup", serverName: "Legacy Server", slug: "backup" }),
      1,
    );

    expect(
      resolveMoviesPreferredSourceIndex(preference, [
        playSource({ name: "Full", serverName: "Server 1", slug: "full" }),
        playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }),
      ]),
    ).toBe(1);
  });

  it("prefers server matches before slug-only matches", () => {
    const preference = moviesSourcePreferenceSnapshot(
      playSource({ name: "Backup", serverName: "Server 2", slug: "shared" }),
      1,
    );

    expect(
      resolveMoviesPreferredSourceIndex(preference, [
        playSource({ name: "Full", serverName: "Server 1", slug: "shared" }),
        playSource({ name: "Backup", serverName: "Server 2", slug: "episode-backup" }),
      ]),
    ).toBe(1);
  });

  it("falls back to the same server when the source label changes", () => {
    const preference = moviesSourcePreferenceSnapshot(
      playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }),
      1,
    );

    expect(
      resolveMoviesPreferredSourceIndex(preference, [
        playSource({ name: "Full", serverName: "Server 1", slug: "backup" }),
        playSource({ name: "Alternate", serverName: "Server 2", slug: "alternate" }),
      ]),
    ).toBe(1);
  });

  it("falls back to server and name when slug is unavailable", () => {
    const preference = moviesSourcePreferenceSnapshot(
      playSource({ name: "Backup", serverName: "Server 2", slug: "" }),
      1,
    );

    expect(
      resolveMoviesPreferredSourceIndex(preference, [
        playSource({ name: "Full", serverName: "Server 1", slug: "" }),
        playSource({ name: "Backup", serverName: "Server 2", slug: "" }),
      ]),
    ).toBe(1);
  });

  it("falls back to the first source when preference is unavailable", () => {
    const preference = moviesSourcePreferenceSnapshot(
      playSource({ name: "Missing", serverName: "Server 9", slug: "missing" }),
      1,
    );

    expect(resolveMoviesPreferredSourceIndex(preference, [playSource()])).toBe(0);
    expect(resolveMoviesPreferredSourceIndex(null, [playSource()])).toBe(0);
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
