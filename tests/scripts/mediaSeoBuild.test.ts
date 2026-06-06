import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildMediaSeoBundle,
  createFixtureFetch,
  createThrottledLog,
  mediaSeoChangeWindow,
} from "../../scripts/build-media-seo.mjs";

let tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tmpRoots.map((root) => rm(root, { force: true, recursive: true })));
  tmpRoots = [];
});

describe("media SEO publish script", () => {
  it("overlaps by one UTC day and caps the TMDB changes window to 14 days", () => {
    expect(
      mediaSeoChangeWindow(
        { lastSuccessfulEndDate: "2026-06-01" },
        new Date("2026-06-06T12:00:00.000Z"),
      ),
    ).toEqual({ endDate: "2026-06-06", startDate: "2026-05-31" });

    expect(
      mediaSeoChangeWindow(
        { lastSuccessfulEndDate: "2026-01-01" },
        new Date("2026-06-06T12:00:00.000Z"),
      ),
    ).toEqual({ endDate: "2026-06-06", startDate: "2026-05-24" });
  });

  it("throttles progress logs and flushes the latest pending message", () => {
    const messages: string[] = [];
    let now = 0;
    let scheduledCallback: () => void = () => undefined;
    let scheduledDelay: number | null = null;
    const log = createThrottledLog((message) => messages.push(message), {
      clearTimer: () => {
        scheduledCallback = () => undefined;
        scheduledDelay = null;
      },
      intervalMs: 10_000,
      now: () => now,
      setTimer: (callback, delay) => {
        scheduledCallback = callback;
        scheduledDelay = delay;
        return {};
      },
    });

    log("start");
    log("movie 1/20");
    log("movie 2/20");

    expect(messages).toEqual(["start"]);
    expect(scheduledDelay).toBe(10_000);

    now = 10_000;
    scheduledCallback();

    expect(messages).toEqual(["start", "movie 2/20"]);

    log("upload 1/30");
    log("upload 2/30");
    log.flush();

    expect(messages).toEqual(["start", "movie 2/20", "upload 2/30"]);
  });

  it("writes a dry-run bundle from local TMDB fixtures without per-title JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "media-seo-build-"));
    tmpRoots.push(root);
    const fixturesDir = join(root, "fixtures");
    const outDir = join(root, "media-dist");
    await writeFixtureFiles(fixturesDir);

    const summary = await buildMediaSeoBundle({
      fetchImpl: createFixtureFetch(fixturesDir),
      movieIds: [550],
      now: new Date("2026-06-06T00:00:00.000Z"),
      outDir,
      tmdbToken: "test-token",
      tvIds: [1399],
      upload: false,
    });

    const files = await listFiles(outDir);

    expect(summary.documents).toBe(8);
    expect(files).toContain("seo/en/movie/550-fight-club.html");
    expect(files).toContain("seo/vi/movie/550-fight-club-vn.html");
    expect(files).toContain("seo/en/tv/1399-game-of-thrones/season/1/episode/1.html");
    expect(files).toContain("sitemaps/media-index.xml");
    expect(files).toContain("sitemaps/media-en-0001.xml");
    expect(files).toContain("sitemaps/media-vi-0001.xml");
    expect(files.some((file) => file.startsWith("seo/") && file.endsWith(".json"))).toBe(false);

    const movieHtml = await readFile(join(outDir, "seo/en/movie/550-fight-club.html"), "utf8");
    expect(movieHtml).toContain("<title>Fight Club | Movie | daopk.me</title>");
    expect(movieHtml).toContain('"@type":"Movie"');
  });

  it("flushes rendered HTML to R2 before final sitemap and state outputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "media-seo-flush-"));
    tmpRoots.push(root);
    const fixturesDir = join(root, "fixtures");
    const outDir = join(root, "media-dist");
    await writeFixtureFiles(fixturesDir);
    const putKeys: string[] = [];
    const storedObjects = new Map<string, Uint8Array>();

    const summary = await buildMediaSeoBundle({
      fetchImpl: createFixtureFetch(fixturesDir),
      movieIds: [550],
      outDir,
      r2Client: {
        deleteObject: async () => undefined,
        getBytes: async (key: string) => storedObjects.get(key) ?? null,
        getText: async (key: string) => {
          const bytes = storedObjects.get(key);
          return bytes === undefined ? null : new TextDecoder().decode(bytes);
        },
        listKeys: async () => [],
        putObject: async (key: string, body: string | Uint8Array | ArrayBuffer) => {
          putKeys.push(key);
          storedObjects.set(key, bodyBytes(body));
        },
      },
      tmdbToken: "test-token",
      tvIds: [],
      upload: true,
    });

    expect(summary.upload.uploaded).toBeGreaterThan(2);
    expect(putKeys.slice(0, 2)).toEqual([
      "seo/en/movie/550-fight-club.html",
      "seo/vi/movie/550-fight-club-vn.html",
    ]);
    expect(putKeys.indexOf("sitemaps/media-index.xml")).toBeGreaterThan(1);
    expect(putKeys.filter((key) => key.endsWith(".html"))).toEqual([
      "seo/en/movie/550-fight-club.html",
      "seo/vi/movie/550-fight-club-vn.html",
    ]);
  });
});

async function writeFixtureFiles(fixturesDir: string): Promise<void> {
  await writeJson(join(fixturesDir, "movie-550-en-US.json"), {
    id: 550,
    adult: false,
    title: "Fight Club",
    overview: "An insomniac office worker meets a soap maker.",
    release_date: "1999-10-15",
    runtime: 139,
    genres: [{ name: "Drama" }],
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
  });
  await writeJson(join(fixturesDir, "movie-550-vi-VN.json"), {
    id: 550,
    adult: false,
    title: "Fight Club VN",
    overview: "",
    release_date: "1999-10-15",
    runtime: 139,
    genres: [{ name: "Tam ly" }],
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
  });
  await writeJson(join(fixturesDir, "tv-1399-en-US.json"), {
    id: 1399,
    adult: false,
    name: "Game of Thrones",
    overview: "Nine noble families fight for control.",
    first_air_date: "2011-04-17",
    number_of_seasons: 1,
    number_of_episodes: 1,
    genres: [{ name: "Drama" }],
    poster_path: "/series-poster.jpg",
    backdrop_path: "/series-backdrop.jpg",
    seasons: [{ season_number: 0 }, { season_number: 1 }],
  });
  await writeJson(join(fixturesDir, "tv-1399-vi-VN.json"), {
    id: 1399,
    adult: false,
    name: "Game of Thrones VN",
    overview: "",
    first_air_date: "2011-04-17",
    number_of_seasons: 1,
    number_of_episodes: 1,
    genres: [{ name: "Chinh kich" }],
    poster_path: "/series-poster.jpg",
    backdrop_path: "/series-backdrop.jpg",
    seasons: [{ season_number: 1 }],
  });
  await writeJson(join(fixturesDir, "tv-1399-season-1-en-US.json"), {
    id: 3624,
    name: "Season 1",
    overview: "The first season.",
    season_number: 1,
    air_date: "2011-04-17",
    poster_path: "/season-poster.jpg",
    episodes: [
      {
        id: 63056,
        name: "Winter Is Coming",
        overview: "A deserter is tracked down.",
        episode_number: 1,
        air_date: "2011-04-17",
        still_path: "/episode.jpg",
      },
    ],
  });
  await writeJson(join(fixturesDir, "tv-1399-season-1-vi-VN.json"), {
    id: 3624,
    name: "Mua 1",
    overview: "",
    season_number: 1,
    air_date: "2011-04-17",
    poster_path: "/season-poster.jpg",
    episodes: [
      {
        id: 63056,
        name: "",
        overview: "",
        episode_number: 1,
        air_date: "2011-04-17",
        still_path: "/episode.jpg",
      },
    ],
  });
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(current, entry.name);
      return entry.isDirectory() ? listFiles(root, path) : [relative(root, path)];
    }),
  );
  return files.flat().sort();
}

function bodyBytes(body: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }
  return body instanceof Uint8Array ? body : new Uint8Array(body);
}
