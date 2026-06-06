import { describe, expect, it, vi } from "vitest";

import {
  buildMovieSeoDocuments,
  buildSitemapDocuments,
  buildTvSeoDocuments,
  escapeHtml,
  fetchTmdbChangedIds,
  jsonLdScript,
  mediaSeoR2KeyForRoute,
  parseMediaSeoRoute,
  slugifyMediaTitle,
} from "../../scripts/lib/mediaSeo.mjs";

const EN_MOVIE = {
  id: 550,
  adult: false,
  title: "Fight <Club>",
  overview: "An insomniac office worker meets a soap maker.",
  release_date: "1999-10-15",
  runtime: 139,
  genres: [{ name: "Drama" }],
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
};

const VI_MOVIE_WITH_MISSING_OVERVIEW = {
  ...EN_MOVIE,
  title: "Fight Club VN",
  overview: "",
  genres: [{ name: "Tam ly" }],
};

const EN_SERIES = {
  id: 1399,
  adult: false,
  name: "Game of Thrones",
  overview: "Nine noble families fight for control.",
  first_air_date: "2011-04-17",
  number_of_seasons: 8,
  number_of_episodes: 73,
  genres: [{ name: "Drama" }],
  poster_path: "/series-poster.jpg",
  backdrop_path: "/series-backdrop.jpg",
};

const VI_SERIES_WITH_MISSING_OVERVIEW = {
  ...EN_SERIES,
  name: "Game of Thrones VN",
  overview: "",
};

const EN_SEASON = {
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
      still_path: null,
    },
  ],
};

const VI_SEASON_WITH_MISSING_FIELDS = {
  ...EN_SEASON,
  name: "Mua 1",
  overview: "",
  episodes: [
    {
      ...EN_SEASON.episodes[0],
      name: "",
      overview: "",
    },
  ],
};

describe("media SEO renderer", () => {
  it("slugifies TMDB titles and parses supported public routes", () => {
    expect(slugifyMediaTitle("Doi song: The Movie!")).toBe("doi-song-the-movie");

    expect(parseMediaSeoRoute("/movie/550-fight-club")).toEqual({
      locale: "en",
      mediaType: "movie",
      pageType: "movie",
      tmdbId: 550,
      slug: "fight-club",
    });
    expect(parseMediaSeoRoute("/vi/tv/1399-game-of-thrones/season/1/episode/2")).toEqual({
      episodeNumber: 2,
      locale: "vi",
      mediaType: "tv",
      pageType: "episode",
      seasonNumber: 1,
      slug: "game-of-thrones",
      tmdbId: 1399,
    });
    expect(parseMediaSeoRoute("/movie/0-bad")).toBeNull();
    expect(parseMediaSeoRoute("/vi/legacy/550-fight-club")).toBeNull();
  });

  it("maps parsed routes to the exact R2 HTML key layout", () => {
    const route = parseMediaSeoRoute("/vi/tv/1399-game-of-thrones/season/1/episode/2");

    expect(route).not.toBeNull();
    expect(mediaSeoR2KeyForRoute(route!)).toBe(
      "seo/vi/tv/1399-game-of-thrones/season/1/episode/2.html",
    );
  });

  it("escapes HTML and JSON-LD before embedding them in documents", () => {
    expect(escapeHtml(`A&B "<tag>"`)).toBe("A&amp;B &quot;&lt;tag&gt;&quot;");
    expect(jsonLdScript({ name: "A < B" })).toBe('{"name":"A \\u003c B"}');

    const [document] = buildMovieSeoDocuments({
      en: EN_MOVIE,
      vi: VI_MOVIE_WITH_MISSING_OVERVIEW,
    });

    expect(document.html).toContain("<title>Fight &lt;Club&gt; | Movie | daopk.me</title>");
    expect(document.html).toContain('"name":"Fight \\u003cClub\\u003e"');
    expect(document.html).not.toContain("<title>Fight <Club>");
  });

  it("uses field-by-field Vietnamese fallback while keeping Vietnamese URLs", () => {
    const documents = buildMovieSeoDocuments({
      en: EN_MOVIE,
      vi: VI_MOVIE_WITH_MISSING_OVERVIEW,
    });
    const viDocument = documents.find((document) => document.locale === "vi");

    expect(viDocument?.key).toBe("seo/vi/movie/550-fight-club-vn.html");
    expect(viDocument?.publicPath).toBe("/vi/movie/550-fight-club-vn");
    expect(viDocument?.html).toContain("An insomniac office worker meets a soap maker.");
    expect(viDocument?.html).toContain(
      'hreflang="en" href="https://daopk.me/movie/550-fight-club"',
    );
    expect(viDocument?.html).toContain(
      'hreflang="vi" href="https://daopk.me/vi/movie/550-fight-club-vn"',
    );
  });

  it("renders TV series, season, and episode JSON-LD without season zero", () => {
    const documents = buildTvSeoDocuments({
      enSeasons: [{ ...EN_SEASON, season_number: 0 }, EN_SEASON],
      enSeries: EN_SERIES,
      viSeasons: [VI_SEASON_WITH_MISSING_FIELDS],
      viSeries: VI_SERIES_WITH_MISSING_OVERVIEW,
    });

    expect(documents.map((document) => document.key)).toContain(
      "seo/en/tv/1399-game-of-thrones/season/1.html",
    );
    expect(documents.map((document) => document.key)).toContain(
      "seo/en/tv/1399-game-of-thrones/season/1/episode/1.html",
    );
    expect(documents.map((document) => document.key)).not.toContain(
      "seo/en/tv/1399-game-of-thrones/season/0.html",
    );

    const episode = documents.find((document) => document.pageType === "episode");
    expect(episode?.html).toContain('"@type":"TVEpisode"');
    expect(episode?.html).toContain('"partOfSeason"');
  });

  it("chunks media sitemap records by locale", () => {
    const sitemaps = buildSitemapDocuments(
      [
        { locale: "en", publicPath: "/movie/1-a", lastmod: "2026-06-01" },
        { locale: "en", publicPath: "/movie/2-b", lastmod: "2026-06-02" },
        { locale: "vi", publicPath: "/vi/movie/1-a", lastmod: "2026-06-01" },
      ],
      { chunkSize: 1 },
    );

    expect(sitemaps.map((sitemap) => sitemap.key)).toEqual([
      "sitemaps/media-index.xml",
      "sitemaps/media-en-0001.xml",
      "sitemaps/media-en-0002.xml",
      "sitemaps/media-vi-0001.xml",
    ]);
    expect(sitemaps[0].body).toContain("https://daopk.me/sitemap-media-en-0001.xml");
    expect(sitemaps[1].body).toContain("https://daopk.me/movie/1-a");
  });

  it("logs TMDB changes pagination progress", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 2, results: [{ id: 550 }] }))
      .mockResolvedValueOnce(jsonResponse({ page: 2, total_pages: 2, results: [{ id: 551 }] }));
    const log = vi.fn();

    await expect(
      fetchTmdbChangedIds({
        endDate: "2026-06-06",
        fetchImpl,
        log,
        mediaType: "movie",
        startDate: "2026-06-05",
        token: "test-token",
      }),
    ).resolves.toEqual([550, 551]);

    expect(log).toHaveBeenCalledWith("movie changes page 1/2");
    expect(log).toHaveBeenCalledWith("movie changes page 2/2");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });
}
