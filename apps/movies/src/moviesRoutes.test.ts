import { describe, expect, it } from "vitest";

import { DEFAULT_MOVIES_LIST_LIMIT, type MoviePersonCredit } from "./moviesApi";
import {
  createMoviesListView,
  createMoviesSearchView,
  movieEpisodeWatchViewFromTarget,
  moviePersonViewFromCredit,
  moviesDeepLinkFromInitialState,
  moviesDeepLinkFromLaunchArgs,
  moviesDeepLinkFromPathname,
  moviesPathForView,
  moviesViewFromDeepLink,
} from "./moviesRoutes";

describe("moviesRoutes", () => {
  it("parses canonical detail, person, and episode paths", () => {
    expect(moviesDeepLinkFromPathname("/movie/550-fight-club")).toEqual({
      mediaType: "movie",
      name: "detail",
      slug: "fight-club",
      tmdbId: 550,
    });
    expect(moviesDeepLinkFromPathname("/tv/1399-planet-cinema")).toEqual({
      mediaType: "tv",
      name: "detail",
      slug: "planet-cinema",
      tmdbId: 1399,
    });
    expect(moviesDeepLinkFromPathname("/person/819-edward-norton")).toEqual({
      name: "person",
      slug: "edward-norton",
      tmdbId: 819,
    });
    expect(moviesDeepLinkFromPathname("/tv/1399-planet-cinema/season/1")).toEqual({
      name: "season",
      seasonNumber: 1,
      slug: "planet-cinema",
      tmdbId: 1399,
    });
    expect(moviesDeepLinkFromPathname("/tv/1399-planet-cinema/season/1/episode/2")).toEqual({
      episodeNumber: 2,
      name: "episode",
      seasonNumber: 1,
      slug: "planet-cinema",
      tmdbId: 1399,
    });
  });

  it("rejects unsupported or unsafe paths", () => {
    expect(moviesDeepLinkFromPathname("/apps/movies")).toBeNull();
    expect(moviesDeepLinkFromPathname("/movie/0-zero")).toBeNull();
    expect(moviesDeepLinkFromPathname("/movie/550-fight%2Fclub")).toBeNull();
    expect(moviesDeepLinkFromPathname("/movie/550-fight-club/season/1/episode/1")).toBeNull();
    expect(moviesDeepLinkFromPathname("/tv/1399-planet-cinema/season/01")).toBeNull();
    expect(moviesDeepLinkFromPathname("/tv/1399-planet-cinema/season/01/episode/1")).toBeNull();
    expect(moviesDeepLinkFromPathname("/tv/1399-planet-cinema/season/1/episode/0")).toBeNull();
  });

  it("normalizes launch args with path fallback", () => {
    expect(
      moviesDeepLinkFromLaunchArgs({
        mediaType: "tv",
        seasonNumber: "0",
        episodeNumber: "1",
        slug: "planet-cinema",
        tmdbId: "1399",
      }),
    ).toEqual({
      episodeNumber: 1,
      name: "episode",
      seasonNumber: 0,
      slug: "planet-cinema",
      tmdbId: 1399,
    });

    expect(
      moviesDeepLinkFromLaunchArgs({
        mediaType: "tv",
        seasonNumber: "2",
        slug: "planet-cinema",
        tmdbId: "1399",
      }),
    ).toEqual({
      name: "season",
      seasonNumber: 2,
      slug: "planet-cinema",
      tmdbId: 1399,
    });

    expect(
      moviesDeepLinkFromLaunchArgs({
        path: "/person/819-edward-norton",
      }),
    ).toEqual({
      name: "person",
      slug: "edward-norton",
      tmdbId: 819,
    });
  });

  it("prefers explicit launch args over the browser pathname", () => {
    expect(
      moviesDeepLinkFromInitialState(
        { mediaType: "movie", slug: "fight-club", tmdbId: 550 },
        "/person/819-edward-norton",
      ),
    ).toEqual({
      mediaType: "movie",
      name: "detail",
      slug: "fight-club",
      tmdbId: 550,
    });
  });

  it("creates extensible view models and canonical paths", () => {
    expect(createMoviesListView({ kind: "popular-tv" })).toEqual({
      name: "list",
      query: { kind: "popular-tv", limit: DEFAULT_MOVIES_LIST_LIMIT },
    });
    expect(createMoviesSearchView("Fight")).toEqual({
      name: "list",
      query: { keyword: "Fight", limit: DEFAULT_MOVIES_LIST_LIMIT, media: "all" },
    });
    expect(
      moviesPathForView(
        moviesViewFromDeepLink({
          mediaType: "movie",
          name: "detail",
          tmdbId: 550,
        }),
      ),
    ).toBe("/movie/550-tmdb-550");
    expect(
      moviesPathForView({
        name: "season",
        seasonNumber: 1,
        slug: "planet cinema",
        tmdbId: 1399,
      }),
    ).toBe("/tv/1399-planet%20cinema/season/1");
    expect(
      moviesPathForView({
        episodeNumber: 2,
        name: "episode",
        seasonNumber: 1,
        slug: "planet cinema",
        tmdbId: 1399,
      }),
    ).toBe("/tv/1399-planet%20cinema/season/1/episode/2");
    expect(
      moviesPathForView({
        autoplay: true,
        name: "watch",
        target: { kind: "movie", slug: "fight-club", tmdbId: 550 },
      }),
    ).toBe("/movie/550-fight-club");
    expect(
      moviesPathForView(
        movieEpisodeWatchViewFromTarget({
          episodeNumber: 2,
          seasonNumber: 1,
          slug: "planet-cinema",
          tmdbId: 1399,
        }),
      ),
    ).toBe("/tv/1399-planet-cinema/season/1/episode/2");
  });

  it("builds person routes from credits and ignores missing TMDB ids", () => {
    const person: MoviePersonCredit = {
      episodeCount: null,
      id: "person-819",
      name: "Đạo Diễn",
      profileUrl: "",
      role: "Director",
      tmdbId: 819,
    };

    expect(moviePersonViewFromCredit(person)).toEqual({
      name: "person",
      slug: "dao-dien",
      tmdbId: 819,
    });
    expect(moviePersonViewFromCredit({ ...person, tmdbId: null })).toBeNull();
  });
});
