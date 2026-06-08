import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  type AppChromeController,
} from "@daopk/sdk";

import type {
  MovieDetail,
  MovieEpisodeDetail,
  MoviePersonDetail,
  MoviePlayInfo,
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

vi.mock("./components/MovieHlsPlayer.vue", () => ({
  default: {
    name: "MovieHlsPlayer",
    props: {
      autoplay: { default: false, type: Boolean },
      play: { required: true, type: Object },
      posterUrl: { default: "", type: String },
      title: { required: true, type: String },
    },
    template: `
      <div
        class="movies-hls-player"
        :data-autoplay="autoplay ? 'true' : 'false'"
        :data-title="title"
      >
        <video />
      </div>
    `,
  },
}));

import App from "./App.vue";
import {
  DEFAULT_MOVIES_LIST_LIMIT,
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

function playInfo(overrides: Partial<MoviePlayInfo> = {}): MoviePlayInfo {
  return {
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
    play: null,
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
              play: null,
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
              play: null,
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
              play: null,
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

function click(element: Element): void {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }),
  );
}

function menuItem(label: string): Element {
  const item = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (item === undefined) {
    throw new Error(`Menu item not found: ${label}`);
  }
  return item;
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

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders Home with a mobile hero slider and grouped TMDB discovery rows", async () => {
    const wrapper = mount(App);
    await settle();

    expect(wrapper.find(".movies-home__hero-backdrop").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-edge").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-slider").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-slide--active").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-rating").text()).toBe("TMDB 8.4");
    expect(wrapper.find(".movies-home__hero-actions").exists()).toBe(false);
    expect(wrapper.find(".movies-home__hero-dots").exists()).toBe(false);
    expect(wrapper.text()).toContain("Trending");
    expect(wrapper.text()).toContain("Popular");
    expect(wrapper.text()).toContain("Current");
    expect(wrapper.text()).toContain("Now Playing");
    expect(wrapper.text()).toContain("Airing Today");
    expect(wrapper.text()).toContain("Fight Club");
    expect(wrapper.find('[aria-label="View all Trending Movies"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Trending TV"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Popular Movies"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Popular TV"]').exists()).toBe(true);
    expect(wrapper.find(".movies-toolbar__credit").exists()).toBe(false);
    expect(wrapper.find('select[aria-label="Country"]').exists()).toBe(false);
    expect(wrapper.findAll(".movies-toolbar__menu-button").map((button) => button.text())).toEqual([
      "Movies",
      "TV",
    ]);
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "trending-movie", limit: 6, period: "week" }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "popular-tv", limit: 12, period: "week" }),
      expect.anything(),
    );

    const dragEvent = new Event("dragstart", { bubbles: true, cancelable: true });
    expect(wrapper.get(".movie-card__poster").element.dispatchEvent(dragEvent)).toBe(false);
    expect(dragEvent.defaultPrevented).toBe(true);
  });

  it("shows the toolbar background only after the current view scrolls", async () => {
    const wrapper = mount(App);
    await settle();

    const toolbar = wrapper.get(".movies-toolbar");
    expect(toolbar.classes()).not.toContain("movies-toolbar--solid");

    const home = wrapper.get(".movies-home");
    home.element.scrollTop = 40;
    await home.trigger("scroll");
    expect(toolbar.classes()).toContain("movies-toolbar--solid");

    await wrapper.get(".movie-card").trigger("click");
    await settle();
    expect(wrapper.get(".movies-toolbar").classes()).not.toContain("movies-toolbar--solid");

    const detailView = wrapper.get(".movies-detail");
    detailView.element.scrollTop = 40;
    await detailView.trigger("scroll");
    expect(wrapper.get(".movies-toolbar").classes()).toContain("movies-toolbar--solid");
  });

  it("opens Movies and TV from the toolbar section menu", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await settle();

    vi.mocked(fetchMoviesList).mockClear();
    click(wrapper.get('button[aria-label="Movies menu"]').element);
    await settle();

    expect(
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(["Movies", "TV"]);

    click(menuItem("TV"));
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "popular-tv", limit: DEFAULT_MOVIES_LIST_LIMIT, page: 1 }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("Popular TV");

    click(wrapper.get('button[aria-label="Movies menu"]').element);
    await settle();
    click(menuItem("Movies"));
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "popular-movie",
        limit: DEFAULT_MOVIES_LIST_LIMIT,
        page: 1,
      }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("Popular Movies");
  });

  it("switches Home Trending and Popular periods", async () => {
    const wrapper = mount(App);
    await settle();

    vi.mocked(fetchMoviesList).mockClear();
    await wrapper.get('[aria-label="Trending period"] button[data-value="day"]').trigger("click");
    await settle();

    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "trending-movie", limit: 12, period: "day" }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "trending-tv", limit: 12, period: "day" }),
      expect.anything(),
    );

    vi.mocked(fetchMoviesList).mockClear();
    await wrapper.get('[aria-label="Popular period"] button[data-value="month"]').trigger("click");
    await settle();

    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "popular-movie", limit: 12, period: "month" }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "popular-tv", limit: 12, period: "month" }),
      expect.anything(),
    );
  });

  it("keeps Home content mounted while a period refresh is loading", async () => {
    const wrapper = mount(App);
    await settle();

    let resolveRefresh!: (result: MoviesListResult) => void;
    const refreshResult = new Promise<MoviesListResult>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.mocked(fetchMoviesList).mockImplementation(() => refreshResult);

    await wrapper.get('[aria-label="Trending period"] button[data-value="day"]').trigger("click");

    expect(wrapper.find(".movies-home__hero-backdrop").exists()).toBe(true);
    expect(wrapper.find(".movies-loading-overlay").exists()).toBe(false);
    expect(wrapper.text()).toContain("Fight Club");

    resolveRefresh(
      list([
        movie({
          id: "movie-551",
          name: "Day Shift",
          tmdbId: 551,
        }),
      ]),
    );
    await settle();

    expect(wrapper.text()).toContain("Day Shift");
  });

  it("opens a keyword List Page from toolbar search and switches media tabs", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await settle();

    expect(wrapper.find('input[type="search"]').exists()).toBe(false);

    await wrapper.get(".movies-toolbar__search-button").trigger("click");
    await settle();

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeInstanceOf(HTMLElement);
    expect(dialog?.querySelector("h2")?.textContent).toBe("Search");
    expect(dialog?.textContent).not.toContain("Movies and TV");

    const searchInput = document.body.querySelector<HTMLInputElement>(
      'input[type="search"][aria-label="Search movies"]',
    );
    expect(searchInput).toBeInstanceOf(HTMLInputElement);
    searchInput!.value = "Fight";
    searchInput!.dispatchEvent(new Event("input", { bubbles: true }));

    const searchForm = document.body.querySelector<HTMLFormElement>('form[role="search"]');
    expect(searchForm).toBeInstanceOf(HTMLFormElement);
    searchForm!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyword: "Fight",
        limit: DEFAULT_MOVIES_LIST_LIMIT,
        media: "all",
        page: 1,
      }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("Search: Fight");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    const moviesTab = wrapper
      .findAll(".movies-list__tabs button")
      .find((button) => button.text().trim() === "Movies");
    expect(moviesTab).toBeDefined();
    await moviesTab!.trigger("click");
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyword: "Fight",
        limit: DEFAULT_MOVIES_LIST_LIMIT,
        media: "movie",
        page: 1,
      }),
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
    expect(wrapper.get(".movies-detail-hero__backdrop img").attributes("src")).toBe(
      "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    );
    expect(wrapper.get(".movies-detail-hero__backdrop source").attributes()).toMatchObject({
      media: "(max-width: 700px)",
      srcset: "https://image.tmdb.org/t/p/w500/poster.jpg",
    });
    expect(wrapper.get(".movies-detail-section__description").text()).toBe(
      "An insomniac office worker meets a soap maker.",
    );
    expect(wrapper.text()).toContain("Edward Norton");
    expect(wrapper.text()).toContain("David Fincher");
    expect(wrapper.findAll("button").some((button) => button.text().trim() === "Watch")).toBe(
      false,
    );
    expect(wrapper.find(".movies-hls-player").exists()).toBe(false);
  });

  it("shows a movie player when Detail has a play source", async () => {
    vi.mocked(fetchMovieDetail).mockResolvedValue(detail({ play: playInfo() }));

    const wrapper = mount(App);
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    const watchButton = wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Watch");
    expect(watchButton).toBeDefined();
    expect(wrapper.find(".movies-hls-player").exists()).toBe(false);

    await watchButton!.trigger("click");
    await settle();

    expect(wrapper.find(".movies-hls-player").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player").attributes("data-autoplay")).toBe("true");
    expect(wrapper.find("video").exists()).toBe(true);
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

  it("shows a hosted mobile close control and dispatches chrome close", async () => {
    const close = vi.fn();
    const appChrome: AppChromeController = {
      rendersAppChrome: true,
      setBackAction: vi.fn(),
      setContentSize: vi.fn(),
      setTitle: vi.fn(),
      setTitlebar: vi.fn(),
      hide: vi.fn(),
      close,
    };

    const wrapper = mount(App, {
      global: {
        provide: {
          [AppChromeInjectionKey as symbol]: appChrome,
        },
      },
    });
    await settle();

    await wrapper.get('button[aria-label="Close Movies"]').trigger("click");

    expect(close).toHaveBeenCalledTimes(1);
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
    expect(wrapper.find(".movies-hls-player").exists()).toBe(false);
    expect(wrapper.find(".movies-episode__still").exists()).toBe(true);
    expect(wrapper.find(".movies-episode__item-media").exists()).toBe(true);
    expect(wrapper.find(".movies-episode__item-overview").text()).toBe("Pilot overview.");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/1/episode/2");
  });

  it("renders an HLS player for a direct episode route with a play source", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema/season/1/episode/1");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());
    const season = seasonDetail();
    const episode = { ...season.episodes[0]!, play: playInfo({ slug: "planet-cinema" }) };
    vi.mocked(fetchMovieEpisode).mockResolvedValue(
      episodeDetail({ episode, season: { ...season, episodes: [episode, season.episodes[1]!] } }),
    );

    const wrapper = mount(App);
    await settle();

    expect(fetchMovieEpisode).toHaveBeenCalledWith(1399, 1, 1, expect.anything());
    expect(wrapper.find(".movies-hls-player").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player").attributes("data-autoplay")).toBe("false");
    expect(wrapper.find("video").exists()).toBe(true);
    expect(wrapper.find(".movies-episode__still").exists()).toBe(false);
    expect(wrapper.find(".movies-episode__play-overlay").exists()).toBe(true);
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
    mount(App, {
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
