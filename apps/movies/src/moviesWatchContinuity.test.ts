import { afterEach, describe, expect, it } from "vitest";

import type { MoviePlaySource } from "./moviesApi";
import { createMoviesWatchContinuity, type MoviesWatchTarget } from "./moviesWatchContinuity";

const STORAGE_NAMESPACE = "movies-watch-continuity-test";

function movieTarget(tmdbId = 550): MoviesWatchTarget {
  return {
    kind: "movie",
    slug: tmdbId === 550 ? "fight-club" : `movie-${tmdbId}`,
    tmdbId,
  };
}

function episodeTarget(episodeNumber: number, seasonNumber = 1, tmdbId = 1399): MoviesWatchTarget {
  return {
    episodeNumber,
    kind: "episode",
    seasonNumber,
    slug: "planet-cinema",
    tmdbId,
  };
}

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

describe("moviesWatchContinuity", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("saves and resumes progress through the continuity interface", () => {
    const continuity = createMoviesWatchContinuity({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const target = movieTarget();

    expect(continuity.progressFor(target)).toBeNull();

    continuity.saveProgress(target, { currentTime: 42, duration: 120 });

    expect(continuity.progressFor(target)).toEqual({
      currentTime: 42,
      duration: 120,
      updatedAt: 1_000,
    });
    expect(continuity.progressFor(target, { duration: 80 })?.currentTime).toBe(42);

    continuity.dispose();
  });

  it("reconciles progress saved by two live continuity instances", () => {
    let now = 1_000;
    const firstContinuity = createMoviesWatchContinuity({
      now: () => now,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const secondContinuity = createMoviesWatchContinuity({
      now: () => now,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const firstMovie = movieTarget();
    const secondMovie = movieTarget(551);

    firstContinuity.saveProgress(firstMovie, { currentTime: 30, duration: 120 });
    now = 2_000;
    secondContinuity.saveProgress(secondMovie, { currentTime: 45, duration: 120 });

    expect(firstContinuity.continueWatching().map((record) => record.target.tmdbId)).toEqual([
      551, 550,
    ]);
    expect(secondContinuity.progressFor(firstMovie)?.currentTime).toBe(30);

    firstContinuity.dispose();
    secondContinuity.dispose();

    const restoredContinuity = createMoviesWatchContinuity({
      now: () => 3_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    expect(restoredContinuity.continueWatching().map((record) => record.target.tmdbId)).toEqual([
      551, 550,
    ]);
    restoredContinuity.dispose();
  });

  it("removes progress that is too early, near the end, or invalid for the active duration", () => {
    const continuity = createMoviesWatchContinuity({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const target = movieTarget();

    continuity.saveProgress(target, { currentTime: 2, duration: 120 });
    expect(continuity.progressFor(target)).toBeNull();

    continuity.saveProgress(target, { currentTime: 110, duration: 120 });
    expect(continuity.progressFor(target)).toBeNull();

    continuity.saveProgress(target, { currentTime: 42, duration: 120 });
    expect(continuity.progressFor(target, { duration: 50 })).toBeNull();
    expect(continuity.continueWatching()).toEqual([]);

    continuity.dispose();
  });

  it("returns Continue Watching records newest first and removes a whole TV series", () => {
    let now = 1_000;
    const continuity = createMoviesWatchContinuity({
      now: () => now,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const movie = movieTarget();
    const firstEpisode = episodeTarget(1);
    const secondEpisode = episodeTarget(2);

    continuity.saveProgress(movie, { currentTime: 30, duration: 120 });
    now = 2_000;
    continuity.saveProgress(firstEpisode, { currentTime: 40, duration: 120 });
    now = 3_000;
    continuity.saveProgress(secondEpisode, { currentTime: 50, duration: 120 });

    expect(continuity.continueWatching({ limit: 2 }).map((record) => record.target)).toMatchObject([
      { episodeNumber: 2, kind: "episode", tmdbId: 1399 },
      { episodeNumber: 1, kind: "episode", tmdbId: 1399 },
    ]);

    continuity.removeFromContinueWatching(secondEpisode);

    expect(continuity.continueWatching().map((record) => record.target)).toMatchObject([
      { kind: "movie", tmdbId: 550 },
    ]);

    continuity.dispose();
  });

  it("restores an item source by exact stream URL before semantic identity", () => {
    const continuity = createMoviesWatchContinuity({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const target = movieTarget();
    const savedSource = playSource({
      m3u8Url: "https://stream.example.test/fight-club/old.m3u8",
      serverName: "Server 2",
      slug: "backup",
    });
    continuity.saveProgress(target, {
      currentTime: 30,
      duration: 120,
      source: savedSource,
      sourceIndex: 0,
    });

    expect(
      continuity.restoreSource(target, [
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

    continuity.dispose();
  });

  it("keeps module-lifetime choice ahead of item progress without leaking across lifetimes", () => {
    const continuity = createMoviesWatchContinuity({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const target = episodeTarget(2);
    const primarySource = playSource({ serverName: "Server 1", slug: "main" });
    const backupSource = playSource({
      name: "Backup",
      serverName: "Server 2",
      slug: "backup",
    });
    const sources = [primarySource, backupSource];
    continuity.saveProgress(target, {
      currentTime: 30,
      duration: 120,
      source: primarySource,
      sourceIndex: 0,
    });

    expect(continuity.selectSource(target, sources, 1)).toBe(1);
    expect(continuity.restoreSource(target, sources)).toBe(1);
    continuity.dispose();

    const nextContinuity = createMoviesWatchContinuity({
      now: () => 2_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    expect(nextContinuity.restoreSource(target, sources)).toBe(0);
    nextContinuity.dispose();
  });

  it("carries a selected server to the next episode in the same source session", () => {
    const continuity = createMoviesWatchContinuity({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    const firstSources = [
      playSource({
        m3u8Url: "https://stream.example.test/episode-1/main.m3u8",
        serverName: "Server 1",
        slug: "main",
      }),
      playSource({
        m3u8Url: "https://stream.example.test/episode-1/backup.m3u8",
        name: "Backup",
        serverName: "Server 2",
        slug: "backup",
      }),
    ];
    const secondSources = [
      playSource({
        m3u8Url: "https://stream.example.test/episode-2/main.m3u8",
        serverName: "Server 1",
        slug: "main",
      }),
      playSource({
        m3u8Url: "https://stream.example.test/episode-2/backup.m3u8",
        name: "Backup",
        serverName: "Server 2",
        slug: "backup",
      }),
    ];
    continuity.saveProgress(episodeTarget(1), {
      currentTime: 30,
      duration: 120,
      source: firstSources[1],
      sourceIndex: 1,
    });
    continuity.saveProgress(episodeTarget(2), {
      currentTime: 30,
      duration: 120,
      source: secondSources[0],
      sourceIndex: 0,
    });

    const firstIndex = continuity.restoreSource(episodeTarget(1), firstSources);
    continuity.selectSource(episodeTarget(1), firstSources, firstIndex);

    expect(firstIndex).toBe(1);
    expect(continuity.restoreSource(episodeTarget(2), secondSources)).toBe(1);

    continuity.dispose();
  });

  it("persists an explicit source preference across module lifetimes", () => {
    const sources = [
      playSource({ serverName: "Server 1", slug: "main" }),
      playSource({ name: "Backup", serverName: "Server 2", slug: "backup" }),
    ];
    const firstContinuity = createMoviesWatchContinuity({
      now: () => 1_000,
      storageNamespace: STORAGE_NAMESPACE,
    });

    firstContinuity.selectSource(movieTarget(), sources, 1);
    firstContinuity.dispose();

    const nextContinuity = createMoviesWatchContinuity({
      now: () => 2_000,
      storageNamespace: STORAGE_NAMESPACE,
    });
    expect(nextContinuity.restoreSource(movieTarget(551), sources)).toBe(1);
    nextContinuity.dispose();
  });

  it("hydrates the existing Movies storage schema without exposing it to callers", () => {
    localStorage.setItem(
      `${STORAGE_NAMESPACE}:playback-progress`,
      JSON.stringify({
        __v: 1,
        data: {
          entries: {
            "movie:550": {
              currentTime: 42,
              duration: 120,
              source: {
                filename: "backup.m3u8",
                index: 1,
                m3u8Url: "https://stream.example.test/backup.m3u8",
                name: "Backup",
                serverName: "Server 2",
                slug: "backup",
              },
              updatedAt: 1_000,
            },
          },
        },
      }),
    );
    const continuity = createMoviesWatchContinuity({
      now: () => 2_000,
      storageNamespace: STORAGE_NAMESPACE,
    });

    expect(continuity.progressFor(movieTarget())?.currentTime).toBe(42);
    expect(
      continuity.restoreSource(movieTarget(), [
        playSource(),
        playSource({
          m3u8Url: "https://stream.example.test/backup.m3u8",
          name: "Backup",
          serverName: "Server 2",
          slug: "backup",
        }),
      ]),
    ).toBe(1);

    continuity.dispose();
  });
});
