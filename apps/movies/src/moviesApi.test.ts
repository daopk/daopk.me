import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMoviesFiltersUrl,
  buildMoviePersonUrl,
  buildMovieSeasonUrl,
  buildMoviesListUrl,
  DEFAULT_MOVIES_LIST_LIMIT,
  fetchMoviesFilters,
  fetchMoviesList,
  movieDetailFromPayload,
  movieEpisodeDetailFromParts,
  moviesFiltersFromPayload,
  moviePersonFromPayload,
  movieSeasonFromPayload,
  moviesListFromPayload,
  tmdbImageUrl,
} from "./moviesApi";

describe("moviesApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes TMDB image URLs", () => {
    expect(tmdbImageUrl("/poster.jpg")).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
    expect(tmdbImageUrl("/backdrop.jpg", "w1280")).toBe(
      "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    );
    expect(tmdbImageUrl("https://image.tmdb.org/t/p/w500/poster.jpg")).toBe(
      "https://image.tmdb.org/t/p/w500/poster.jpg",
    );
    expect(tmdbImageUrl("bad/path.jpg")).toBe("");
  });

  it("builds public Movies API URLs for lists and search", () => {
    const listUrl = new URL(
      buildMoviesListUrl({ kind: "trending-tv", page: 2, period: "day" }),
      "https://daopk.test",
    );
    expect(listUrl.pathname).toBe("/public/movies/list");
    expect(listUrl.searchParams.get("kind")).toBe("trending-tv");
    expect(listUrl.searchParams.get("page")).toBe("2");
    expect(listUrl.searchParams.get("limit")).toBe(String(DEFAULT_MOVIES_LIST_LIMIT));
    expect(listUrl.searchParams.get("period")).toBe("day");
    expect(listUrl.searchParams.has("country")).toBe(false);

    const catalogUrl = new URL(
      buildMoviesListUrl({ country: "kr", genre: 18, media: "tv", sort: "newest" }),
      "https://daopk.test",
    );
    expect(catalogUrl.pathname).toBe("/public/movies/list");
    expect(catalogUrl.searchParams.has("kind")).toBe(false);
    expect(catalogUrl.searchParams.get("media")).toBe("tv");
    expect(catalogUrl.searchParams.get("genre")).toBe("18");
    expect(catalogUrl.searchParams.get("country")).toBe("KR");
    expect(catalogUrl.searchParams.get("sort")).toBe("newest");

    const allCatalogUrl = new URL(buildMoviesListUrl({ media: "all" }), "https://daopk.test");
    expect(allCatalogUrl.pathname).toBe("/public/movies/list");
    expect(allCatalogUrl.searchParams.get("media")).toBe("all");

    const searchUrl = new URL(
      buildMoviesListUrl({ keyword: "Fight Club", media: "movie" }),
      "https://daopk.test",
    );
    expect(searchUrl.pathname).toBe("/public/movies/search");
    expect(searchUrl.searchParams.get("query")).toBe("Fight Club");
    expect(searchUrl.searchParams.get("media")).toBe("movie");
    expect(searchUrl.searchParams.get("page")).toBe("1");
    expect(searchUrl.searchParams.get("limit")).toBe(String(DEFAULT_MOVIES_LIST_LIMIT));
    expect(searchUrl.searchParams.has("country")).toBe(false);

    const cappedUrl = new URL(
      buildMoviesListUrl({ kind: "trending-movie", limit: 120 }),
      "https://daopk.test",
    );
    expect(cappedUrl.searchParams.get("limit")).toBe("100");

    const seasonUrl = new URL(buildMovieSeasonUrl(1399, 2), "https://daopk.test");
    expect(seasonUrl.pathname).toBe("/public/movies/season/1399/2");

    const personUrl = new URL(buildMoviePersonUrl(819), "https://daopk.test");
    expect(personUrl.pathname).toBe("/public/movies/person/819");

    const filtersUrl = new URL(buildMoviesFiltersUrl("tv"), "https://daopk.test");
    expect(filtersUrl.pathname).toBe("/public/movies/filters");
    expect(filtersUrl.searchParams.get("media")).toBe("tv");
  });

  it("normalizes app-ready TMDB list payloads", () => {
    const result = moviesListFromPayload(
      {
        items: [
          {
            backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
            canonicalPath: "/movie/550-fight-club",
            genres: [{ id: "18", name: "Drama", slug: "drama" }],
            mediaType: "movie",
            name: "Fight Club",
            originName: "Fight Club",
            overview: "An insomniac office worker meets a soap maker.",
            posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
            rating: 8.4,
            releaseDate: "1999-10-15",
            slug: "fight-club",
            tmdbId: 550,
          },
          {
            mediaType: "person",
            name: "Ignored Person",
            tmdbId: 1,
          },
        ],
        pagination: { totalItems: 2, totalItemsPerPage: 20, currentPage: 1, totalPages: 1 },
      },
      { page: 1, limit: 24 },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        canonicalPath: "/movie/550-fight-club",
        id: "movie-550",
        mediaType: "movie",
        name: "Fight Club",
        posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
        rating: 8.4,
        year: 1999,
      }),
    );
    expect(result.pagination.totalPages).toBe(1);
  });

  it("fetches Movies lists with limit and preserves API pagination", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://daopk.test");
      expect(url.pathname).toBe("/public/movies/list");
      expect(url.searchParams.get("limit")).toBe("24");
      return new Response(
        JSON.stringify({
          items: [],
          pagination: {
            currentPage: 1,
            totalItems: 7,
            totalItemsPerPage: 7,
            totalPages: 1,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetch);

    const result = await fetchMoviesList({ kind: "trending-movie" });

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.pagination.totalItemsPerPage).toBe(7);
  });

  it("fetches All catalog lists by combining movie and TV pages", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://daopk.test");
      const media = url.searchParams.get("media");
      expect(url.pathname).toBe("/public/movies/list");
      expect(url.searchParams.get("limit")).toBe("12");
      if (media === "movie") {
        return new Response(
          JSON.stringify({
            items: [{ mediaType: "movie", name: "Fight Club", tmdbId: 550 }],
            pagination: {
              currentPage: 1,
              totalItems: 2,
              totalItemsPerPage: 1,
              totalPages: 2,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (media === "tv") {
        return new Response(
          JSON.stringify({
            items: [{ mediaType: "tv", name: "Planet Cinema", tmdbId: 1399 }],
            pagination: {
              currentPage: 1,
              totalItems: 3,
              totalItemsPerPage: 1,
              totalPages: 3,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected media: ${media}`);
    });
    vi.stubGlobal("fetch", fetch);

    const result = await fetchMoviesList({ limit: 24, media: "all" });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.items.map((item) => item.mediaType)).toEqual(["movie", "tv"]);
    expect(result.pagination).toEqual({
      currentPage: 1,
      totalItems: 5,
      totalItemsPerPage: 2,
      totalPages: 3,
    });
  });

  it("normalizes and fetches Movies filter metadata", async () => {
    const result = moviesFiltersFromPayload(
      {
        countries: [
          { code: "KR", name: "South Korea" },
          { code: "bad", name: "Ignored" },
          { code: "US", name: "United States of America" },
        ],
        genres: [
          { id: 28, name: "Action", slug: "action" },
          { id: 0, name: "Ignored" },
          { id: 18, name: "Drama" },
        ],
        media: "movie",
        sortOptions: [
          { label: "Popular", value: "popular" },
          { label: "Ignored", value: "rating" },
          { label: "Newest", value: "newest" },
        ],
      },
      "tv",
    );

    expect(result).toEqual({
      countries: [
        { code: "KR", name: "South Korea" },
        { code: "US", name: "United States of America" },
      ],
      genres: [
        { id: 28, name: "Action", slug: "action" },
        { id: 18, name: "Drama", slug: "drama" },
      ],
      media: "movie",
      sortOptions: [
        { label: "Popular", value: "popular" },
        { label: "Newest", value: "newest" },
      ],
    });

    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://daopk.test");
      expect(url.pathname).toBe("/public/movies/filters");
      expect(url.searchParams.get("media")).toBe("tv");
      return new Response(
        JSON.stringify({
          countries: [{ code: "US", name: "United States of America" }],
          genres: [{ id: 99, name: "Documentary" }],
          media: "tv",
          sortOptions: [{ label: "Popular", value: "popular" }],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetch);

    await expect(fetchMoviesFilters("tv")).resolves.toMatchObject({
      countries: [{ code: "US", name: "United States of America" }],
      genres: [{ id: 99, name: "Documentary" }],
      media: "tv",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("normalizes detail payloads and keeps playback dormant", () => {
    const detail = movieDetailFromPayload({
      backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      cast: [
        {
          episodeCount: 12,
          id: "person-1",
          name: "Ada Wong",
          profileUrl: "https://image.tmdb.org/t/p/w185/ada.jpg",
          role: "Host",
          tmdbId: 1,
        },
      ],
      canonicalPath: "/tv/1399-planet-cinema",
      collection: { name: "Ignored TV Collection", tmdbId: 10 },
      content: "A TV show about movies.",
      crew: [{ id: "person-2", name: "Nia Creator", role: "Creator", tmdbId: 2 }],
      episodeTotal: "12",
      facts: [{ label: "Episodes", value: "12" }],
      genres: [{ id: "99", name: "Documentary", slug: "documentary" }],
      mediaType: "tv",
      name: "Planet Cinema",
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      rating: null,
      releaseDate: "2024-01-01",
      seasons: [
        {
          airDate: "2024-01-01",
          episodeCount: 12,
          id: "season-1",
          name: "Season 1",
          posterUrl: "",
          seasonNumber: 1,
        },
      ],
      slug: "planet-cinema",
      status: "Returning Series",
      tmdbId: 1399,
      year: 2024,
    });

    expect(detail).toEqual(
      expect.objectContaining({
        content: "A TV show about movies.",
        cast: [expect.objectContaining({ name: "Ada Wong", role: "Host" })],
        collection: expect.objectContaining({ name: "Ignored TV Collection" }),
        crew: [expect.objectContaining({ name: "Nia Creator", role: "Creator" })],
        facts: [{ label: "Episodes", value: "12" }],
        mediaType: "tv",
        name: "Planet Cinema",
        play: null,
        seasons: [expect.objectContaining({ episodeCount: 12, name: "Season 1" })],
      }),
    );
  });

  it("normalizes play sources on movie detail payloads", () => {
    const detail = movieDetailFromPayload({
      canonicalPath: "/movie/550-fight-club",
      mediaType: "movie",
      name: "Fight Club",
      play: {
        slug: "fight-club",
        sources: [
          {
            embedUrl: "https://player.example.test/player/?url=fight-club",
            filename: "fight-club.m3u8",
            m3u8Url: "https://stream.example.test/fight-club/master.m3u8",
            name: "Full",
            serverName: "Server 1",
            slug: "full",
          },
          {
            m3u8Url: "http://stream.example.test/insecure.m3u8",
            name: "Ignored",
            serverName: "Server 2",
          },
          {
            m3u8Url: "not a url",
            name: "Ignored",
            serverName: "Server 3",
          },
        ],
      },
      releaseDate: "1999-10-15",
      slug: "fight-club",
      tmdbId: 550,
    });

    expect(detail?.play).toEqual({
      slug: "fight-club",
      sources: [
        {
          embedUrl: "https://player.example.test/player/?url=fight-club",
          filename: "fight-club.m3u8",
          m3u8Url: "https://stream.example.test/fight-club/master.m3u8",
          name: "Full",
          serverName: "Server 1",
          slug: "full",
        },
      ],
    });
  });

  it("drops empty play payloads", () => {
    expect(
      movieDetailFromPayload({
        canonicalPath: "/movie/550-fight-club",
        mediaType: "movie",
        name: "Fight Club",
        play: {
          slug: "fight-club",
          sources: [{ m3u8Url: "http://stream.example.test/insecure.m3u8" }],
        },
        releaseDate: "1999-10-15",
        slug: "fight-club",
        tmdbId: 550,
      })?.play,
    ).toBeNull();
  });

  it("normalizes TMDB person detail payloads", () => {
    const person = moviePersonFromPayload({
      biography: "Edward Norton is an American actor and filmmaker.",
      birthday: "1969-08-18",
      canonicalPath: "/tmdb/person/819-edward-norton",
      credits: [
        {
          canonicalPath: "/tv/1399-planet-cinema",
          mediaType: "tv",
          name: "Planet Cinema",
          posterUrl: "https://image.tmdb.org/t/p/w500/tv.jpg",
          releaseDate: "2024-01-01",
          tmdbId: 1399,
        },
      ],
      facts: [{ label: "Known For", value: "Acting" }],
      knownFor: [
        {
          canonicalPath: "/movie/550-fight-club",
          mediaType: "movie",
          name: "Fight Club",
          posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
          releaseDate: "1999-10-15",
          tmdbId: 550,
        },
        { mediaType: "person", name: "Ignored", tmdbId: 1 },
      ],
      knownForDepartment: "Acting",
      name: "Edward Norton",
      profileUrl: "https://image.tmdb.org/t/p/w342/edward.jpg",
      tmdbId: 819,
    });

    expect(person).toEqual(
      expect.objectContaining({
        biography: "Edward Norton is an American actor and filmmaker.",
        canonicalPath: "/tmdb/person/819-edward-norton",
        credits: [
          expect.objectContaining({
            mediaType: "tv",
            name: "Planet Cinema",
            tmdbId: 1399,
          }),
        ],
        facts: [{ label: "Known For", value: "Acting" }],
        knownFor: [
          expect.objectContaining({
            mediaType: "movie",
            name: "Fight Club",
            tmdbId: 550,
          }),
        ],
        name: "Edward Norton",
        slug: "edward-norton",
        tmdbId: 819,
      }),
    );
  });

  it("normalizes TMDB season detail payloads", () => {
    const season = movieSeasonFromPayload({
      airDate: "2024-01-01",
      episodeCount: 2,
      id: "season-1",
      name: "Season 1",
      overview: "A first season.",
      posterUrl: "https://image.tmdb.org/t/p/w500/season.jpg",
      seasonNumber: 1,
      episodes: [
        {
          airDate: "2024-01-01",
          episodeNumber: 1,
          id: "episode-1",
          name: "Pilot",
          overview: "Pilot overview.",
          play: {
            slug: "planet-cinema",
            sources: [
              {
                embedUrl: "https://player.example.test/player/?url=planet-cinema",
                filename: "tap-1.m3u8",
                m3u8Url: "https://stream.example.test/planet-cinema/tap-1.m3u8",
                name: "Episode 1",
                serverName: "Server 1",
                slug: "tap-1",
              },
            ],
          },
          rating: 7.8,
          runtime: 42,
          seasonNumber: 1,
          stillUrl: "https://image.tmdb.org/t/p/w300/episode.jpg",
          tmdbId: 100,
        },
        {
          episodeNumber: 0,
          name: "Ignored",
          seasonNumber: 1,
        },
      ],
    });

    expect(season).toEqual(
      expect.objectContaining({
        episodeCount: 2,
        episodes: [
          expect.objectContaining({
            episodeNumber: 1,
            name: "Pilot",
            play: expect.objectContaining({
              sources: [
                expect.objectContaining({
                  m3u8Url: "https://stream.example.test/planet-cinema/tap-1.m3u8",
                }),
              ],
            }),
            rating: 7.8,
            runtime: 42,
            stillUrl: "https://image.tmdb.org/t/p/w300/episode.jpg",
          }),
        ],
        name: "Season 1",
        seasonNumber: 1,
        year: 2024,
      }),
    );
  });

  it("aggregates series, season, and selected episode detail data", () => {
    const series = movieDetailFromPayload({
      canonicalPath: "/tv/1399-planet-cinema",
      mediaType: "tv",
      name: "Planet Cinema",
      releaseDate: "2024-01-01",
      slug: "planet-cinema",
      tmdbId: 1399,
    });
    const season = movieSeasonFromPayload({
      episodes: [
        {
          episodeNumber: 1,
          name: "Pilot",
          seasonNumber: 1,
        },
      ],
      name: "Season 1",
      seasonNumber: 1,
    });

    expect(series).not.toBeNull();
    expect(season).not.toBeNull();
    expect(movieEpisodeDetailFromParts(series!, season!, 1)).toEqual({
      episode: expect.objectContaining({ episodeNumber: 1, name: "Pilot" }),
      season: expect.objectContaining({ name: "Season 1" }),
      series: expect.objectContaining({ name: "Planet Cinema" }),
    });
    expect(movieEpisodeDetailFromParts(series!, season!, 2)).toBeNull();
  });

  it("uses the default list limit when fallback pagination is needed", () => {
    const result = moviesListFromPayload({}, { page: 1, limit: DEFAULT_MOVIES_LIST_LIMIT });
    expect(result.pagination.totalItemsPerPage).toBe(DEFAULT_MOVIES_LIST_LIMIT);
  });
});
