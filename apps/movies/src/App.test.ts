import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppContextInjectionKey } from "@daopk/sdk";

import type {
  MovieDetail,
  MovieEpisodeDetail,
  MoviePersonDetail,
  MovieSeasonDetail,
  MovieSummary,
  MoviesListResult,
} from "./moviesApi";

vi.mock("./moviesApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./moviesApi")>();
  return {
    ...actual,
    fetchMovieDetail: vi.fn(),
    fetchMovieEpisode: vi.fn(),
    fetchMoviePerson: vi.fn(),
    fetchMovieSeason: vi.fn(),
    fetchMoviesList: vi.fn(),
  };
});

import App from "./App.vue";
import {
  fetchMovieDetail,
  fetchMovieEpisode,
  fetchMoviePerson,
  fetchMovieSeason,
  fetchMoviesList,
} from "./moviesApi";

function movie(overrides: Partial<MovieSummary> = {}): MovieSummary {
  return {
    backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    canonicalPath: "/movie/550-fight-club",
    genres: [{ id: "18", name: "Drama", slug: "drama" }],
    id: "movie-550",
    mediaType: "movie",
    name: "Fight Club",
    originName: "",
    overview: "An insomniac office worker meets a soap maker.",
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    rating: 8.4,
    releaseDate: "1999-10-15",
    slug: "fight-club",
    thumbUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    tmdbId: 550,
    year: 1999,
    ...overrides,
  };
}

function detail(overrides: Partial<MovieDetail> = {}): MovieDetail {
  return {
    ...movie(),
    cast: [
      {
        episodeCount: null,
        id: "person-819",
        name: "Edward Norton",
        profileUrl: "",
        role: "The Narrator",
        tmdbId: 819,
      },
    ],
    collection: null,
    content: "An insomniac office worker meets a soap maker.",
    crew: [
      {
        episodeCount: null,
        id: "person-7467",
        name: "David Fincher",
        profileUrl: "",
        role: "Director",
        tmdbId: 7467,
      },
    ],
    episodeTotal: "",
    facts: [
      { label: "Release Date", value: "1999-10-15" },
      { label: "Runtime", value: "139 min" },
    ],
    runtime: 139,
    seasons: [],
    status: "Released",
    ...overrides,
  };
}

function tvDetail(overrides: Partial<MovieDetail> = {}): MovieDetail {
  return detail({
    canonicalPath: "/tv/1399-planet-cinema",
    episodeTotal: "11",
    facts: [{ label: "Episodes", value: "11" }],
    id: "tv-1399",
    mediaType: "tv",
    name: "Planet Cinema",
    runtime: null,
    seasons: [
      {
        airDate: "2024-01-01",
        episodeCount: 10,
        id: "season-1",
        name: "Season 1",
        overview: "A first season.",
        posterUrl: "",
        seasonNumber: 1,
        year: 2024,
      },
      {
        airDate: "2025-01-01",
        episodeCount: 1,
        id: "season-2",
        name: "Season 2",
        overview: "",
        posterUrl: "",
        seasonNumber: 2,
        year: 2025,
      },
    ],
    slug: "planet-cinema",
    tmdbId: 1399,
    ...overrides,
  });
}

function list(items: readonly MovieSummary[]): MoviesListResult {
  return {
    items,
    pagination: {
      totalItems: items.length,
      totalItemsPerPage: 24,
      currentPage: 1,
      totalPages: 1,
    },
  };
}

function seasonDetail(overrides: Partial<MovieSeasonDetail> = {}): MovieSeasonDetail {
  const seasonNumber = overrides.seasonNumber ?? 1;
  return {
    airDate: seasonNumber === 1 ? "2024-01-01" : "2025-01-01",
    episodeCount: seasonNumber === 1 ? 2 : 1,
    episodes:
      seasonNumber === 1
        ? [
            {
              airDate: "2024-01-01",
              episodeNumber: 1,
              id: "episode-1",
              name: "Pilot",
              overview: "Pilot overview.",
              rating: 7.8,
              runtime: 42,
              seasonNumber: 1,
              stillUrl: "",
              tmdbId: 1001,
            },
            {
              airDate: "2024-01-08",
              episodeNumber: 2,
              id: "episode-2",
              name: "The Edit",
              overview: "",
              rating: null,
              runtime: 42,
              seasonNumber: 1,
              stillUrl: "",
              tmdbId: 1002,
            },
          ]
        : [
            {
              airDate: "2025-01-01",
              episodeNumber: 1,
              id: "episode-3",
              name: "Second Premiere",
              overview: "",
              rating: null,
              runtime: 44,
              seasonNumber: 2,
              stillUrl: "",
              tmdbId: 1003,
            },
          ],
    id: `season-${seasonNumber}`,
    name: `Season ${seasonNumber}`,
    overview: "",
    posterUrl: "",
    seasonNumber,
    year: seasonNumber === 1 ? 2024 : 2025,
    ...overrides,
  };
}

function episodeDetail(overrides: Partial<MovieEpisodeDetail> = {}): MovieEpisodeDetail {
  const season = overrides.season ?? seasonDetail();
  const episode = overrides.episode ?? season.episodes[0]!;
  return {
    episode,
    season,
    series: tvDetail(),
    ...overrides,
  };
}

function personDetail(overrides: Partial<MoviePersonDetail> = {}): MoviePersonDetail {
  return {
    biography: "Edward Norton is an American actor and filmmaker.",
    birthday: "1969-08-18",
    canonicalPath: "/person/819-edward-norton",
    credits: [
      movie({
        canonicalPath: "/tv/1399-planet-cinema",
        id: "tv-1399",
        mediaType: "tv",
        name: "Planet Cinema",
        slug: "planet-cinema",
        tmdbId: 1399,
      }),
    ],
    deathday: "",
    facts: [
      { label: "Known For", value: "Acting" },
      { label: "Birthday", value: "1969-08-18" },
    ],
    id: "person-819",
    knownFor: [movie()],
    knownForDepartment: "Acting",
    name: "Edward Norton",
    placeOfBirth: "Boston, Massachusetts, USA",
    profileUrl: "",
    slug: "edward-norton",
    tmdbId: 819,
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await flushPromises();
  await flushPromises();
  await flushPromises();
}

describe("Movies app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/apps/movies");
    vi.mocked(fetchMoviesList).mockResolvedValue(list([movie()]));
    vi.mocked(fetchMovieDetail).mockResolvedValue(detail());
    vi.mocked(fetchMoviePerson).mockResolvedValue(personDetail());
    vi.mocked(fetchMovieSeason).mockImplementation(async (_tmdbId, seasonNumber) =>
      seasonDetail({ seasonNumber }),
    );
    vi.mocked(fetchMovieEpisode).mockImplementation(
      async (_tmdbId, seasonNumber, episodeNumber) => {
        const season = seasonDetail({ seasonNumber });
        const episode = season.episodes.find((entry) => entry.episodeNumber === episodeNumber);
        if (episode === undefined) {
          throw new Error("Episode not found.");
        }
        return episodeDetail({ episode, season });
      },
    );
  });

  it("renders Home with a cover hero and TMDB discovery rows", async () => {
    const wrapper = mount(App);
    await settle();

    expect(wrapper.find(".movies-home__hero-backdrop").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-edge").exists()).toBe(true);
    expect(wrapper.text()).toContain("Trending Movies");
    expect(wrapper.text()).toContain("Trending TV");
    expect(wrapper.text()).toContain("Now Playing");
    expect(wrapper.text()).toContain("Popular Movies");
    expect(wrapper.text()).toContain("Airing Today");
    expect(wrapper.text()).toContain("Fight Club");
    expect(wrapper.find(".movies-toolbar__credit").exists()).toBe(false);
    expect(wrapper.find('select[aria-label="Country"]').exists()).toBe(false);

    const dragEvent = new Event("dragstart", { bubbles: true, cancelable: true });
    expect(wrapper.get(".movie-card__poster").element.dispatchEvent(dragEvent)).toBe(false);
    expect(dragEvent.defaultPrevented).toBe(true);
  });

  it("opens a keyword List Page from toolbar search and switches media tabs", async () => {
    const wrapper = mount(App);
    await settle();

    expect(wrapper.get(".movies-toolbar__search-button").attributes("tabindex")).toBe("-1");

    await wrapper.get('input[type="search"]').setValue("Fight");
    await wrapper.get('form[role="search"]').trigger("submit");
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: "Fight", limit: 32, media: "all", page: 1 }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("Search: Fight");

    const moviesTab = wrapper
      .findAll(".movies-list__tabs button")
      .find((button) => button.text().trim() === "Movies");
    expect(moviesTab).toBeDefined();
    await moviesTab!.trigger("click");
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: "Fight", limit: 32, media: "movie", page: 1 }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("Search Movies: Fight");
  });

  it("opens Detail on canonical TMDB routes and keeps Watch hidden", async () => {
    const wrapper = mount(App);
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("movie", 550, expect.anything());
    expect(window.location.pathname).toBe("/movie/550-fight-club");
    expect(wrapper.text()).toContain("Fight Club");
    expect(wrapper.text()).toContain("Details");
    expect(wrapper.text()).toContain("Edward Norton");
    expect(wrapper.text()).toContain("David Fincher");
    expect(wrapper.text()).not.toContain("No playback source yet");
  });

  it("replaces the toolbar title with history and Home navigation buttons", async () => {
    const wrapper = mount(App);
    await settle();

    const toolbarHistory = wrapper.get(".movies-toolbar__history");
    const backButton = () => toolbarHistory.get('button[aria-label="Back"]');
    const forwardButton = () => toolbarHistory.get('button[aria-label="Forward"]');
    const homeButton = () => toolbarHistory.get('button[aria-label="Home"]');

    expect(toolbarHistory.text()).not.toContain("Movies");
    expect(backButton().attributes("disabled")).toBeDefined();
    expect(forwardButton().attributes("disabled")).toBeDefined();
    expect(homeButton().attributes("disabled")).toBeDefined();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    expect(backButton().attributes("disabled")).toBeUndefined();
    expect(forwardButton().attributes("disabled")).toBeDefined();
    expect(homeButton().attributes("disabled")).toBeUndefined();

    await backButton().trigger("click");
    await settle();

    expect(window.location.pathname).toBe("/apps/movies");
    expect(wrapper.find(".movies-home").exists()).toBe(true);
    expect(backButton().attributes("disabled")).toBeDefined();
    expect(forwardButton().attributes("disabled")).toBeUndefined();
    expect(homeButton().attributes("disabled")).toBeDefined();

    await forwardButton().trigger("click");
    await settle();

    expect(window.location.pathname).toBe("/movie/550-fight-club");
    expect(wrapper.text()).toContain("Fight Club");
    expect(backButton().attributes("disabled")).toBeUndefined();
    expect(forwardButton().attributes("disabled")).toBeDefined();
    expect(homeButton().attributes("disabled")).toBeUndefined();
  });

  it("shows toolbar Home for a direct route with no back history", async () => {
    window.history.replaceState(null, "", "/movie/550-fight-club");
    const wrapper = mount(App);
    await settle();

    const toolbarHistory = wrapper.get(".movies-toolbar__history");
    const backButton = () => toolbarHistory.get('button[aria-label="Back"]');
    const forwardButton = () => toolbarHistory.get('button[aria-label="Forward"]');
    const homeButton = () => toolbarHistory.get('button[aria-label="Home"]');

    expect(wrapper.text()).toContain("Fight Club");
    expect(backButton().attributes("disabled")).toBeDefined();
    expect(forwardButton().attributes("disabled")).toBeDefined();
    expect(homeButton().attributes("disabled")).toBeUndefined();

    await homeButton().trigger("click");
    await settle();

    expect(window.location.pathname).toBe("/apps/movies");
    expect(wrapper.find(".movies-home").exists()).toBe(true);
    expect(backButton().attributes("disabled")).toBeUndefined();
    expect(forwardButton().attributes("disabled")).toBeDefined();
    expect(homeButton().attributes("disabled")).toBeDefined();

    await backButton().trigger("click");
    await settle();

    expect(window.location.pathname).toBe("/movie/550-fight-club");
    expect(wrapper.text()).toContain("Fight Club");
  });

  it("opens actor information from Detail cast cards", async () => {
    const wrapper = mount(App);
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    const actorButton = wrapper
      .findAll(".movies-detail-person")
      .find((button) => button.text().includes("Edward Norton"));
    expect(actorButton).toBeDefined();
    await actorButton!.trigger("click");
    await settle();

    expect(fetchMoviePerson).toHaveBeenCalledWith(819, expect.anything());
    expect(window.location.pathname).toBe("/person/819-edward-norton");
    expect(wrapper.text()).toContain("Biography");
    expect(wrapper.text()).toContain("Edward Norton is an American actor and filmmaker.");
    expect(wrapper.text()).toContain("Known For");
    expect(wrapper.text()).toContain("Fight Club");
  });

  it("opens a direct person route", async () => {
    window.history.replaceState(null, "", "/person/819-edward-norton");

    const wrapper = mount(App);
    await settle();

    expect(fetchMoviePerson).toHaveBeenCalledWith(819, expect.anything());
    expect(wrapper.text()).toContain("Edward Norton");
    expect(wrapper.text()).toContain("Details");
    expect(window.location.pathname).toBe("/person/819-edward-norton");
  });

  it("opens a direct TV route into Detail", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());

    const wrapper = mount(App);
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("tv", 1399, expect.anything());
    expect(wrapper.text()).toContain("Planet Cinema");
    expect(wrapper.text()).toContain("Seasons");
    expect(wrapper.text()).toContain("10 episodes");
    expect(fetchMovieSeason).toHaveBeenCalledWith(1399, 1, expect.anything());
    expect(wrapper.text()).toContain("Episodes");
    expect(wrapper.text()).toContain("Pilot");
    expect(wrapper.find('select[aria-label="Season"]').exists()).toBe(false);
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    const seasonTwoButton = wrapper
      .findAll(".movies-detail-seasons__button")
      .find((button) => button.text().includes("Season 2"));
    expect(seasonTwoButton).toBeDefined();
    expect(seasonTwoButton!.attributes("aria-pressed")).toBe("false");

    await seasonTwoButton!.trigger("click");
    await settle();

    expect(fetchMovieSeason).toHaveBeenLastCalledWith(1399, 2, expect.anything());
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    expect(seasonTwoButton!.attributes("aria-pressed")).toBe("true");
    expect(wrapper.text()).toContain("Second Premiere");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema");
  });

  it("opens episode detail from a TV detail episode row", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());

    const wrapper = mount(App);
    await settle();

    const pilotButton = wrapper
      .findAll(".movies-detail-episodes__button")
      .find((button) => button.text().includes("Pilot"));
    expect(pilotButton).toBeDefined();
    await pilotButton!.trigger("click");
    await settle();

    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/1/episode/1");
    expect(fetchMovieEpisode).toHaveBeenLastCalledWith(1399, 1, 1, expect.anything());
    expect(wrapper.text()).toContain("Episode Details");
    expect(wrapper.text()).toContain("Pilot overview.");
    expect(wrapper.text()).toContain("Series Cast");
  });

  it("opens a direct episode route", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema/season/1/episode/2");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());

    const wrapper = mount(App);
    await settle();

    expect(fetchMovieEpisode).toHaveBeenCalledWith(1399, 1, 2, expect.anything());
    expect(wrapper.text()).toContain("The Edit");
    expect(wrapper.text()).toContain("Episode Details");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/1/episode/2");
  });

  it("ignores unsupported detail routes", async () => {
    window.history.replaceState(null, "", "/legacy/kieu-so");
    const wrapper = mount(App);
    await settle();

    expect(fetchMovieDetail).not.toHaveBeenCalled();
    expect(wrapper.find(".movies-home").exists()).toBe(true);
    expect(window.location.pathname).toBe("/legacy/kieu-so");
  });

  it("accepts TMDB launch args instead of movieSlug", async () => {
    const wrapper = mount(App, {
      global: {
        provide: {
          [AppContextInjectionKey as symbol]: Object.freeze({
            manifestId: "movies",
            handleId: "movies-direct",
            args: Object.freeze({
              mediaType: "tv",
              slug: "planet-cinema",
              tmdbId: 1399,
            }),
          }),
        },
      },
    });
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("tv", 1399, expect.anything());
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema");
  });
});
