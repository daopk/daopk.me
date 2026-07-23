import { afterEach, describe, expect, it } from "vitest";

import type { MoviePlaySource } from "./moviesApi";
import {
  createMoviesPlaybackProgressStore,
  episodePlaybackProgressKey,
  moviePlaybackProgressKey,
  moviesPlaybackProgressSourceSnapshot,
} from "./moviesPlaybackProgress";
import {
  createMoviesSourcePreferenceStore,
  moviesSourcePreferenceSnapshot,
} from "./moviesSourcePreference";
import {
  createMoviesSourceSelection,
  createMoviesSourceSelectionSession,
} from "./moviesSourceSelection";

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

function persistProgress(key: string, source: MoviePlaySource, index: number): void {
  const store = createMoviesPlaybackProgressStore();
  store.save(key, {
    currentTime: 30,
    duration: 120,
    source: moviesPlaybackProgressSourceSnapshot(source, index),
  });
  store.dispose();
}

function persistPreference(source: MoviePlaySource, index: number): void {
  const store = createMoviesSourcePreferenceStore();
  store.save(moviesSourcePreferenceSnapshot(source, index));
  store.dispose();
}

describe("moviesSourceSelection", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("restores an item progress source by exact stream URL before semantic identity", () => {
    const key = moviePlaybackProgressKey(550);
    const savedSource = playSource({
      m3u8Url: "https://stream.example.test/fight-club/old.m3u8",
      serverName: "Server 2",
      slug: "backup",
    });
    persistProgress(key, savedSource, 0);
    const selection = createMoviesSourceSelection();

    expect(
      selection.restore(key, [
        playSource({
          m3u8Url: "https://stream.example.test/fight-club/new.m3u8",
          serverName: "Server 2",
          slug: "backup",
        }),
        playSource({
          m3u8Url: savedSource.m3u8Url,
          serverName: "Server 3",
          slug: "renamed",
        }),
      ]),
    ).toBe(1);

    selection.dispose();
  });

  it("matches a global preference by server before a slug-only match", () => {
    const preference = playSource({
      name: "Backup",
      serverName: "Server 2",
      slug: "shared",
    });
    persistPreference(preference, 1);
    const selection = createMoviesSourceSelection();

    expect(
      selection.restore(moviePlaybackProgressKey(550), [
        playSource({ name: "Full", serverName: "Server 1", slug: "shared" }),
        playSource({ name: "Alternate", serverName: "Server 2", slug: "episode-backup" }),
      ]),
    ).toBe(1);

    selection.dispose();
  });

  it("matches slug and server identity before a slug-only match", () => {
    persistPreference(playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }), 1);
    const selection = createMoviesSourceSelection();

    expect(
      selection.restore(moviePlaybackProgressKey(550), [
        playSource({ name: "Backup", serverName: "Server 1", slug: "backup" }),
        playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }),
      ]),
    ).toBe(1);

    selection.dispose();
  });

  it("matches server and source name when slugs are unavailable", () => {
    persistPreference(playSource({ name: "Backup", serverName: "Server 2", slug: "" }), 1);
    const selection = createMoviesSourceSelection();

    expect(
      selection.restore(moviePlaybackProgressKey(550), [
        playSource({ name: "Full", serverName: "Server 2", slug: "" }),
        playSource({ name: "Backup", serverName: "Server 2", slug: "" }),
      ]),
    ).toBe(1);

    selection.dispose();
  });

  it("falls back from server identity to a matching slug", () => {
    persistPreference(
      playSource({ name: "Backup", serverName: "Legacy Server", slug: "backup" }),
      1,
    );
    const selection = createMoviesSourceSelection();

    expect(
      selection.restore(moviePlaybackProgressKey(550), [
        playSource({ name: "Full", serverName: "Server 1", slug: "full" }),
        playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }),
      ]),
    ).toBe(1);

    selection.dispose();
  });

  it("keeps item progress ahead of the global preference", () => {
    const key = moviePlaybackProgressKey(550);
    const primarySource = playSource({ serverName: "Server 1", slug: "main" });
    const backupSource = playSource({ serverName: "Server 2", slug: "backup" });
    persistPreference(backupSource, 1);
    persistProgress(key, primarySource, 0);
    const selection = createMoviesSourceSelection();

    expect(selection.restore(key, [primarySource, backupSource])).toBe(0);

    selection.dispose();
  });

  it("restores a shared watch session ahead of item progress without affecting new sessions", () => {
    const key = episodePlaybackProgressKey(1399, 1, 2);
    const primarySource = playSource({ serverName: "Server 1", slug: "main" });
    const backupSource = playSource({
      name: "Backup",
      serverName: "Server 2",
      slug: "backup",
    });
    const sources = [primarySource, backupSource];
    persistProgress(key, primarySource, 0);
    const session = createMoviesSourceSelectionSession();
    const firstSelection = createMoviesSourceSelection(session);

    expect(firstSelection.select(sources, 1)).toBe(1);
    firstSelection.dispose();

    const resumedSelection = createMoviesSourceSelection(session);
    expect(resumedSelection.restore(key, sources)).toBe(1);
    resumedSelection.dispose();

    const unrelatedSelection = createMoviesSourceSelection();
    expect(unrelatedSelection.restore(key, sources)).toBe(0);
    unrelatedSelection.dispose();
  });

  it("carries the selected server to another episode ahead of its saved progress", () => {
    const firstKey = episodePlaybackProgressKey(1399, 1, 1);
    const secondKey = episodePlaybackProgressKey(1399, 1, 2);
    const firstSources = [
      playSource({
        filename: "episode-1-main.m3u8",
        m3u8Url: "https://stream.example.test/episode-1/main.m3u8",
        serverName: "Server 1",
        slug: "main",
      }),
      playSource({
        filename: "episode-1-backup.m3u8",
        m3u8Url: "https://stream.example.test/episode-1/backup.m3u8",
        name: "Backup",
        serverName: "Server 2",
        slug: "backup",
      }),
    ];
    const secondSources = [
      playSource({
        filename: "episode-2-main.m3u8",
        m3u8Url: "https://stream.example.test/episode-2/main.m3u8",
        serverName: "Server 1",
        slug: "main",
      }),
      playSource({
        filename: "episode-2-backup.m3u8",
        m3u8Url: "https://stream.example.test/episode-2/backup.m3u8",
        name: "Backup",
        serverName: "Server 2",
        slug: "backup",
      }),
    ];
    persistProgress(firstKey, firstSources[1]!, 1);
    persistProgress(secondKey, secondSources[0]!, 0);
    const selection = createMoviesSourceSelection();

    const firstIndex = selection.restore(firstKey, firstSources);
    selection.select(firstSources, firstIndex);

    expect(firstIndex).toBe(1);
    expect(selection.restore(secondKey, secondSources)).toBe(1);

    selection.dispose();
  });

  it("persists an explicit selection across module lifetimes", () => {
    const sources = [
      playSource({ serverName: "Server 1", slug: "main" }),
      playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }),
    ];
    const firstSelection = createMoviesSourceSelection();

    expect(firstSelection.select(sources, 1)).toBe(1);
    firstSelection.dispose();

    const nextSelection = createMoviesSourceSelection();
    expect(nextSelection.restore(moviePlaybackProgressKey(551), sources)).toBe(1);
    nextSelection.dispose();
  });

  it("falls back safely when no source identity can be restored", () => {
    persistPreference(playSource({ name: "Missing", serverName: "Server 9", slug: "missing" }), 1);
    const selection = createMoviesSourceSelection();

    expect(selection.restore(moviePlaybackProgressKey(550), [playSource()])).toBe(0);
    expect(selection.restore(moviePlaybackProgressKey(550), [])).toBe(0);
    expect(selection.select([], 5)).toBe(0);

    selection.dispose();
  });
});
