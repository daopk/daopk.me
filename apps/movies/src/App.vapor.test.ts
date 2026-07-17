import {
  flushPromises,
  mountVaporTest as mount,
  type VaporTestMountOptions,
  type VaporTestWrapper,
} from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick, onMounted, watchEffect, type Component } from "vue";

import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  KernelInjectionKey,
  type AppChromeController,
  type AppContext,
  type Kernel,
} from "@daopk/sdk";

import type {
  MovieDetail,
  MovieEpisodeDetail,
  MoviePersonDetail,
  MoviePlayInfo,
  MoviePlaySource,
  MovieSeasonDetail,
  MovieTrailerResult,
  MoviesFiltersResult,
  MovieSummary,
  MoviesListResult,
} from "./moviesApi";
import {
  episodePlaybackProgressKey,
  moviePlaybackProgressKey,
  moviesPlaybackProgressSourceSnapshot,
  MOVIES_PLAYBACK_PROGRESS_KV_KEY,
  type MoviesPlaybackProgressEntry,
  type MoviesPlaybackProgressState,
} from "./moviesPlaybackProgress";
import {
  MOVIES_SOURCE_PREFERENCE_KV_KEY,
  moviesSourcePreferenceSnapshot,
  type MoviesSourcePreferenceState,
} from "./moviesSourcePreference";

let defaultMoviesKernel: Kernel;

const movieHlsPlayerHandleAppKeydown = vi.hoisted(() => vi.fn());

vi.mock("./moviesApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./moviesApi")>();
  return {
    ...actual,
    fetchMovieDetail: vi.fn(),
    fetchMovieEpisode: vi.fn(),
    fetchMoviePerson: vi.fn(),
    fetchMovieSeason: vi.fn(),
    fetchMovieTrailer: vi.fn(),
    fetchMoviesFilters: vi.fn(),
    fetchMoviesList: vi.fn(),
  };
});

vi.mock("./components/MovieHlsPlayer.vue", async () => {
  const { defineVaporComponent, watchEffect } = await import("vue");
  return {
    default: defineVaporComponent(
      (
        props: Record<string, unknown>,
        {
          emit,
          expose,
        }: {
          emit: (event: string, ...args: unknown[]) => void;
          expose: (value: Record<string, unknown>) => void;
        },
      ) => {
        expose({ handleAppKeydown: movieHlsPlayerHandleAppKeydown });
        const root = document.createElement("div");
        root.className = "movies-hls-player";
        const back = document.createElement("button");
        back.type = "button";
        back.className = "movies-hls-player__back-button";
        back.ariaLabel = "Back";
        back.textContent = "<";
        back.addEventListener("click", () => emit("back"));
        const next = document.createElement("button");
        next.type = "button";
        next.className = "movies-hls-player__next-episode-button";
        next.textContent = "Next";
        next.addEventListener("click", () => emit("next-episode"));
        const speed = document.createElement("button");
        speed.type = "button";
        speed.className = "movies-hls-player__speed-probe";
        speed.addEventListener("click", () => emit("update:playbackSpeed", 1.5));
        const video = document.createElement("video");

        watchEffect(() => {
          root.dataset.autoplay = props.autoplay ? "true" : "false";
          root.dataset.nextEpisodeLabel = String(props.nextEpisodeLabel ?? "");
          root.dataset.playbackSpeed = String(props.playbackSpeed ?? 1);
          root.dataset.progressKey = String(props.progressKey ?? "");
          root.dataset.sourceIndex = String(props.sourceIndex ?? 0);
          root.dataset.title = String(props.title ?? "");
          back.remove();
          next.remove();
          speed.remove();
          video.remove();
          root.append(back);
          if (props.nextEpisodeLabel) {
            next.ariaLabel = String(props.nextEpisodeLabel);
            root.append(next);
          }
          root.append(speed);
          root.append(video);
        });

        return root;
      },
      {
        inheritAttrs: false,
        name: "MovieHlsPlayer",
        props: [
          "autoplay",
          "nextEpisodeLabel",
          "play",
          "playbackSpeed",
          "posterUrl",
          "progressKey",
          "showBackButton",
          "sourceIndex",
          "title",
        ],
        emits: ["back", "next-episode", "update:playbackSpeed"],
      },
    ),
  };
});

import App from "./App.vue";
import { useSettingsStore } from "~/core/storage/SettingsStore";
import {
  DEFAULT_MOVIES_LIST_LIMIT,
  fetchMovieDetail,
  fetchMovieEpisode,
  fetchMoviesFilters,
  fetchMoviePerson,
  fetchMovieSeason,
  fetchMovieTrailer,
  fetchMoviesList,
} from "./moviesApi";

function mountMovies(options: VaporTestMountOptions = {}): VaporTestWrapper {
  const { global, ...mountOptions } = options;
  return mount(App, {
    ...mountOptions,
    global: {
      ...global,
      provide: {
        [KernelInjectionKey as symbol]: defaultMoviesKernel,
        ...global?.provide,
      },
    },
  });
}

function asEsm(component: Component): { default: Component } {
  return Object.assign(Object.create(null) as { default: Component }, {
    default: component,
    __esModule: true,
  });
}

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

function playSource(overrides: Partial<MoviePlaySource> = {}): MoviePlaySource {
  return {
    ...playInfo().sources[0]!,
    ...overrides,
  };
}

function trailerResult(
  overrides: Partial<NonNullable<MovieTrailerResult["trailer"]>> = {},
): MovieTrailerResult {
  return {
    trailer: {
      key: "M7lc1UVf-VE",
      ...overrides,
    },
  };
}

const APP_PROGRESS_STORAGE_KEY = `movies:${MOVIES_PLAYBACK_PROGRESS_KV_KEY}`;
const APP_SOURCE_PREFERENCE_STORAGE_KEY = `movies:${MOVIES_SOURCE_PREFERENCE_KV_KEY}`;
const TRAILER_PREVIEW_TEST_BEFORE_OPEN_DELAY_MS = 900;
const TRAILER_PREVIEW_TEST_OPEN_DELAY_MS = 1_100;

function persistAppProgress(
  key: string,
  entry: MoviesPlaybackProgressEntry = {
    currentTime: 42,
    duration: 120,
    updatedAt: Date.now(),
  },
): void {
  persistAppProgressEntries({ [key]: entry });
}

function persistAppProgressEntries(entries: Record<string, MoviesPlaybackProgressEntry>): void {
  const state: MoviesPlaybackProgressState = {
    entries,
  };
  localStorage.setItem(
    APP_PROGRESS_STORAGE_KEY,
    JSON.stringify({
      __v: 1,
      data: state,
    }),
  );
}

function readAppProgressState(): MoviesPlaybackProgressState {
  const raw = localStorage.getItem(APP_PROGRESS_STORAGE_KEY);
  if (raw === null) {
    return { entries: {} };
  }

  return (JSON.parse(raw) as { data: MoviesPlaybackProgressState }).data;
}

function persistAppSourcePreference(source: MoviePlaySource, index: number): void {
  const state: MoviesSourcePreferenceState = {
    source: moviesSourcePreferenceSnapshot(source, index),
    updatedAt: Date.now(),
  };
  localStorage.setItem(
    APP_SOURCE_PREFERENCE_STORAGE_KEY,
    JSON.stringify({
      __v: 1,
      data: state,
    }),
  );
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

function list(
  items: readonly MovieSummary[],
  pagination: Partial<MoviesListResult["pagination"]> = {},
): MoviesListResult {
  return {
    items,
    pagination: {
      totalItems: items.length,
      totalItemsPerPage: 24,
      currentPage: 1,
      totalPages: 1,
      ...pagination,
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
    canonicalPath: "/tmdb/person/819-edward-norton",
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

function filters(media: "movie" | "tv" = "movie"): MoviesFiltersResult {
  return {
    countries: [
      { code: "AD", name: "Andorra" },
      { code: "KR", name: "South Korea" },
      { code: "US", name: "United States of America" },
      { code: "VN", name: "Vietnam" },
    ],
    genres:
      media === "tv"
        ? [
            { id: 18, name: "Drama", slug: "drama" },
            { id: 99, name: "Documentary", slug: "documentary" },
          ]
        : [
            { id: 28, name: "Action", slug: "action" },
            { id: 18, name: "Drama", slug: "drama" },
          ],
    media,
    sortOptions: [
      { label: "Popular", value: "popular" },
      { label: "Newest", value: "newest" },
      { label: "Top Rated", value: "top-rated" },
    ],
  };
}

async function settle(): Promise<void> {
  await flushPromises();
  await flushPromises();
  await flushPromises();
}

function dispatchContextMenu(target: Element): void {
  const ev = new Event("contextmenu", { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: 12 },
    clientY: { value: 24 },
    button: { value: 2 },
  });
  target.dispatchEvent(ev);
}

async function flushOverlay(): Promise<void> {
  await nextTick();
  await nextTick();
  await flushPromises();
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForTrailerPreviewOpen(): Promise<void> {
  await waitForMs(TRAILER_PREVIEW_TEST_OPEN_DELAY_MS);
  await flushPromises();
  await nextTick();
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

function kernelWithTheme(theme: "dark" | "light", setTheme = vi.fn()): Kernel {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  return {
    events: {
      emit: vi.fn((event: string, payload: unknown) => {
        for (const handler of listeners.get(event) ?? []) {
          handler(payload);
        }
      }),
      on: vi.fn((event: string, handler: (payload: unknown) => void) => {
        const nextListeners = listeners.get(event) ?? new Set<(payload: unknown) => void>();
        nextListeners.add(handler);
        listeners.set(event, nextListeners);
        return () => {
          nextListeners.delete(handler);
        };
      }),
    },
    theme: {
      current: vi.fn(() => theme),
      setTheme,
    },
  } as unknown as Kernel;
}

function activeHeroLoopLabel(wrapper: VaporTestWrapper): string | undefined {
  return wrapper
    .get(".movies-home__hero-loop .movies-home__hero-slide--active .movies-home__hero-card")
    .attributes("aria-label");
}

function stubHoverPreviewCapability(matches = true): () => void {
  const previous = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });

  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: previous,
    });
  };
}

async function hoverFirstHomeRailCard(
  wrapper: VaporTestWrapper,
  options: { readonly waitForPreview?: boolean } = {},
): Promise<void> {
  const card = wrapper.get(".movies-home__rail .movie-card");
  await card.trigger("pointerenter", { clientX: 240, clientY: 180, pointerType: "mouse" });
  await card.trigger("pointermove", { clientX: 244, clientY: 184, pointerType: "mouse" });
  if (options.waitForPreview !== false) {
    await waitForTrailerPreviewOpen();
  } else {
    await nextTick();
  }
}

async function hoverFirstListCard(wrapper: VaporTestWrapper): Promise<void> {
  const card = wrapper.get(".movies-list__grid .movie-card");
  await card.trigger("pointerenter", { clientX: 240, clientY: 180, pointerType: "mouse" });
  await card.trigger("pointermove", { clientX: 244, clientY: 184, pointerType: "mouse" });
  await waitForTrailerPreviewOpen();
}

function rect(bounds: { left: number; top: number; width: number; height: number }): DOMRect {
  const { left, top, width, height } = bounds;
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("Movies app", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setActivePinia(createPinia());
    vi.clearAllMocks();
    setViewportWidth(1280);
    defaultMoviesKernel = kernelWithTheme("dark");
    delete document.documentElement.dataset.shell;
    localStorage.clear();
    window.history.replaceState(null, "", "/apps/movies");
    vi.mocked(fetchMoviesList).mockResolvedValue(list([movie()]));
    vi.mocked(fetchMoviesFilters).mockImplementation(async (media = "movie") => filters(media));
    vi.mocked(fetchMovieDetail).mockResolvedValue(detail());
    vi.mocked(fetchMoviePerson).mockResolvedValue(personDetail());
    vi.mocked(fetchMovieSeason).mockImplementation(async (_tmdbId, seasonNumber) =>
      seasonDetail({ seasonNumber }),
    );
    vi.mocked(fetchMovieTrailer).mockResolvedValue({ trailer: null });
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
    delete document.documentElement.dataset.shell;
    localStorage.clear();
  });

  it("renders Home with desktop and mobile hero lists plus grouped TMDB discovery rows", async () => {
    const wrapper = mountMovies();
    await settle();

    expect(wrapper.find(".movies-home__hero-backdrop").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-edge").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-desktop").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-list").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-loop").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-loop .movies-home__hero-track").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-slider").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-slider .movies-home__hero-track").exists()).toBe(true);
    expect(wrapper.get(".movies-home__hero-loop").attributes()).toMatchObject({
      "aria-roledescription": "carousel",
      tabindex: "0",
    });
    expect(wrapper.get(".movies-home__hero-slider").attributes()).toMatchObject({
      "aria-roledescription": "carousel",
      tabindex: "0",
    });
    expect(wrapper.find(".movies-home__hero-slide--active").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-featured-card").exists()).toBe(false);
    expect(wrapper.find(".movies-home__hero-showcase").exists()).toBe(false);
    expect(wrapper.find(".movies-home__hero-rating").exists()).toBe(false);
    expect(wrapper.find(".movies-home__hero-chip").exists()).toBe(false);
    expect(wrapper.find(".movies-home__hero-card-title").exists()).toBe(false);
    expect(wrapper.find(".movies-home__hero-stepper-count").exists()).toBe(false);
    expect(wrapper.find('[aria-label="Previous featured title"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Next featured title"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Open Fight Club"]').exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-title-button").exists()).toBe(true);
    expect(wrapper.text()).toContain("Trending this week");
    expect(wrapper.find(".movies-home__hero-actions").exists()).toBe(true);
    expect(wrapper.find(".movies-home__hero-details").exists()).toBe(true);
    expect(wrapper.text()).toContain("Details");
    expect(wrapper.find(".movies-home__hero-dots").exists()).toBe(false);
    expect(wrapper.find(".movies-home__continue").exists()).toBe(false);
    expect(wrapper.text()).toContain("Trending");
    expect(wrapper.text()).not.toContain("Popular");
    expect(wrapper.text()).not.toContain("Current");
    expect(wrapper.text()).not.toContain("Now Playing");
    expect(wrapper.text()).not.toContain("Airing Today");
    expect(wrapper.text()).toContain("Countries");
    expect(wrapper.text()).toContain("South Korea");
    expect(wrapper.text()).toContain("China");
    expect(wrapper.text()).toContain("Genres");
    expect(wrapper.text()).toContain("Fight Club");
    expect(wrapper.find('[aria-label="View all Trending Movies"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Trending TV"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Countries South Korea"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Countries China"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Countries United States"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Countries United Kingdom"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Genres Animation"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Genres Action"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Genres Comedy"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Genres Science Fiction"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="View all Now Playing"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="View all Airing Today"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="View all Popular Movies"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="View all Popular TV"]').exists()).toBe(false);
    expect(wrapper.find(".movies-toolbar__credit").exists()).toBe(false);
    expect(wrapper.find('select[aria-label="Country"]').exists()).toBe(false);
    expect(wrapper.findAll(".movies-toolbar__menu-button").map((button) => button.text())).toEqual([
      "Movies",
      "TV Shows",
    ]);
    expect(wrapper.find('button[aria-label="Genres"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Country"]').exists()).toBe(false);
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "trending-movie", limit: 6, period: "week" }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "KR",
        countryName: "South Korea",
        limit: 12,
        media: "all",
        sort: "top-rated",
      }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "US",
        countryName: "United States of America",
        limit: 12,
        media: "all",
        sort: "top-rated",
      }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "GB",
        countryName: "United Kingdom",
        limit: 12,
        media: "all",
        sort: "top-rated",
      }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "CN",
        countryName: "China",
        limit: 12,
        media: "all",
        sort: "top-rated",
      }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({
        genre: 16,
        genreName: "Animation",
        limit: 12,
        media: "movie",
        sort: "top-rated",
      }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({
        genre: 28,
        genreName: "Action",
        limit: 12,
        media: "movie",
        sort: "top-rated",
      }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({
        genre: 35,
        genreName: "Comedy",
        limit: 12,
        media: "movie",
        sort: "top-rated",
      }),
      expect.anything(),
    );
    expect(fetchMoviesList).toHaveBeenCalledWith(
      expect.objectContaining({
        genre: 878,
        genreName: "Science Fiction",
        limit: 12,
        media: "movie",
        sort: "top-rated",
      }),
      expect.anything(),
    );
    expect(
      vi
        .mocked(fetchMoviesList)
        .mock.calls.some(([query]) => String(query.kind ?? "").startsWith("popular-")),
    ).toBe(false);
    expect(
      vi.mocked(fetchMoviesList).mock.calls.some(([query]) => {
        const kind = String(query.kind ?? "");
        return kind === "now-playing" || kind === "airing-today";
      }),
    ).toBe(false);

    const dragEvent = new Event("dragstart", { bubbles: true, cancelable: true });
    expect(wrapper.get(".movie-card__poster").element.dispatchEvent(dragEvent)).toBe(false);
    expect(dragEvent.defaultPrevented).toBe(true);
  });

  it("suggests switching the system theme to dark mode when opened in light mode", async () => {
    const setTheme = vi.fn();
    const kernel = kernelWithTheme("light", setTheme);

    const wrapper = mountMovies({
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await settle();
    await flushOverlay();

    expect(wrapper.text()).toContain("Watch Movies in dark mode?");
    expect(wrapper.text()).toContain("Switch the system theme to dark mode");

    const switchButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Switch to dark mode"));
    expect(switchButton).toBeDefined();

    await switchButton?.trigger("click");
    await nextTick();

    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(wrapper.text()).not.toContain("Watch Movies in dark mode?");
  });

  it("does not suggest dark mode when Movies opens in dark mode", async () => {
    const kernel = kernelWithTheme("dark");

    const wrapper = mountMovies({
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await settle();
    await flushOverlay();

    expect(wrapper.text()).not.toContain("Watch Movies in dark mode?");
    expect(kernel.theme.setTheme).not.toHaveBeenCalled();
  });

  it("does not suggest dark mode in the mobile shell", async () => {
    setViewportWidth(390);
    const kernel = kernelWithTheme("light");

    const wrapper = mountMovies({
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await settle();
    await flushOverlay();

    expect(wrapper.text()).not.toContain("Watch Movies in dark mode?");
    expect(localStorage.getItem("movies:theme-suggestion")).toBeNull();
  });

  it("suggests dark mode only once per day", async () => {
    const first = mountMovies({
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernelWithTheme("light"),
        },
      },
    });
    await settle();
    await flushOverlay();

    expect(first.text()).toContain("Watch Movies in dark mode?");
    expect(localStorage.getItem("movies:theme-suggestion")).not.toBeNull();

    first.unmount();
    await flushOverlay();

    const second = mountMovies({
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernelWithTheme("light"),
        },
      },
    });
    await settle();
    await flushOverlay();

    expect(second.text()).not.toContain("Watch Movies in dark mode?");
  });

  it("loads and renders a trailer preview when hovering a Home rail card", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();
    const PreviewComponent = defineVaporComponent(
      (
        props: {
          args: { autoplay: boolean; videoId: string };
          input: { kind: string };
          surface: string;
        },
        { emit },
      ) => {
        const preview = document.createElement("div");
        preview.className = "preview-probe";
        preview.textContent = `${props.surface}:${props.args.videoId}:${String(props.args.autoplay)}:${props.input.kind}`;
        onMounted(() => emit("aspect-ratio-change", 0.5625));
        return preview;
      },
      {
        props: ["args", "input", "surface"],
        emits: ["aspect-ratio-change"],
      },
    );
    const provider = {
      id: "youtube-player:video-preview",
      manifestId: "youtube-player",
      surfaces: ["movies.trailer"],
      component: () => Promise.resolve(asEsm(PreviewComponent as Component)),
      match: vi.fn(),
    };
    const resolve = vi.fn(() => ({
      args: { autoplay: true, videoId: "M7lc1UVf-VE" },
      provider,
    }));
    const kernel = {
      ...kernelWithTheme("dark"),
      previews: { resolve },
    } as unknown as Kernel;
    vi.mocked(fetchMovieTrailer).mockResolvedValue(trailerResult());

    const wrapper = mountMovies({
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await settle();
    await hoverFirstHomeRailCard(wrapper);
    await flushPromises();
    await nextTick();

    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 550);
    expect(resolve).toHaveBeenCalledWith(
      {
        kind: "url",
        url: "youtube-player://video/M7lc1UVf-VE?autoplay=1",
      },
      { surface: "movies.trailer" },
    );
    const preview = document.body.querySelector(".movies-trailer-hover-card");
    expect(preview?.textContent).toContain("Fight Club");
    expect(preview?.getAttribute("style")).toContain(
      "--movies-trailer-preview-aspect-ratio: 0.5625 / 1",
    );
    expect(document.body.querySelector(".preview-probe")?.textContent).toBe(
      "movies.trailer:M7lc1UVf-VE:true:url",
    );

    restoreHoverPreview();
  });

  it("waits one second before opening a Home rail trailer preview", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    const card = wrapper.get(".movies-home__rail .movie-card");
    await card.trigger("pointerenter", { clientX: 240, clientY: 180, pointerType: "mouse" });
    await card.trigger("pointermove", { clientX: 244, clientY: 184, pointerType: "mouse" });
    await waitForMs(TRAILER_PREVIEW_TEST_BEFORE_OPEN_DELAY_MS);
    await flushPromises();
    await nextTick();

    expect(fetchMovieTrailer).not.toHaveBeenCalled();
    expect(document.body.querySelector(".movies-trailer-hover-card")).toBeNull();

    await waitForMs(TRAILER_PREVIEW_TEST_OPEN_DELAY_MS - TRAILER_PREVIEW_TEST_BEFORE_OPEN_DELAY_MS);
    await flushPromises();
    await nextTick();

    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 550);
    expect(document.body.querySelector(".movies-trailer-hover-card")).not.toBeNull();

    restoreHoverPreview();
  });

  it("keeps the trailer preview anchored after it appears", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();
    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    const card = wrapper.get(".movies-home__rail .movie-card");
    const rectSpy = vi
      .spyOn(card.element, "getBoundingClientRect")
      .mockReturnValue(rect({ height: 270, left: 100, top: 80, width: 180 }));

    await card.trigger("pointerenter", { clientX: 240, clientY: 180, pointerType: "mouse" });
    await card.trigger("pointermove", { clientX: 300, clientY: 220, pointerType: "mouse" });
    await waitForTrailerPreviewOpen();
    await nextTick();

    const preview = document.body.querySelector(
      ".movies-trailer-hover-card__center",
    ) as HTMLElement | null;
    expect(preview).toBeInstanceOf(HTMLElement);
    const initialTransform = preview?.style.transform;

    await card.trigger("pointermove", { clientX: 460, clientY: 260, pointerType: "mouse" });
    await nextTick();

    expect(preview?.style.transform).toBe(initialTransform);
    expect(rectSpy).toHaveBeenCalled();

    rectSpy.mockRestore();
    restoreHoverPreview();
  });

  it("centers the trailer preview layer over the hovered Home rail card", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();
    const card = wrapper.get(".movies-home__rail .movie-card");
    const rectSpy = vi
      .spyOn(card.element, "getBoundingClientRect")
      .mockReturnValue(rect({ height: 270, left: 100, top: 80, width: 180 }));

    await card.trigger("pointerenter", { clientX: 120, clientY: 100, pointerType: "mouse" });
    await card.trigger("pointermove", { clientX: 260, clientY: 320, pointerType: "mouse" });
    await waitForTrailerPreviewOpen();

    const centerLayer = document.body.querySelector(
      ".movies-trailer-hover-card__center",
    ) as HTMLElement | null;
    expect(centerLayer).toBeInstanceOf(HTMLElement);
    expect(centerLayer?.style.getPropertyValue("--movies-trailer-preview-center-x")).toBe("190px");
    expect(centerLayer?.style.getPropertyValue("--movies-trailer-preview-center-y")).toBe("215px");
    expect(centerLayer?.style.transform).toBe("translate3d(190px, 215px, 0) translate(-50%, -50%)");
    expect(centerLayer?.querySelector(".movies-trailer-hover-card")).not.toBeNull();

    rectSpy.mockRestore();
    restoreHoverPreview();
  });

  it("keeps the trailer preview open when moving from a card into the preview", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();
    const card = wrapper.get(".movies-home__rail .movie-card");
    await hoverFirstHomeRailCard(wrapper);

    const preview = document.body.querySelector(".movies-trailer-hover-card");
    expect(preview).toBeInstanceOf(HTMLElement);

    await card.trigger("pointerleave", { pointerType: "mouse" });
    preview!.dispatchEvent(new Event("pointerenter"));
    await waitForMs(180);
    await nextTick();

    expect(document.body.querySelector(".movies-trailer-hover-card")).not.toBeNull();

    preview!.dispatchEvent(new Event("pointerleave"));
    await waitForMs(180);
    await nextTick();

    expect(document.body.querySelector(".movies-trailer-hover-card")).toBeNull();

    restoreHoverPreview();
  });

  it("keeps the trailer preview open after a card pointer leave when the pointer still rests on the card", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();
    const elementFromPoint = vi.spyOn(document, "elementFromPoint");

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();
    const card = wrapper.get(".movies-home__rail .movie-card");
    await hoverFirstHomeRailCard(wrapper);
    elementFromPoint.mockReturnValue(card.element);

    await card.trigger("pointerleave", { clientX: 244, clientY: 184, pointerType: "mouse" });
    await waitForMs(420);
    await nextTick();

    expect(document.body.querySelector(".movies-trailer-hover-card")).not.toBeNull();

    wrapper.unmount();
    elementFromPoint.mockRestore();
    restoreHoverPreview();
  });

  it("keeps the trailer preview open after preview pointer leave when scroll leaves the pointer over the card", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();
    const elementFromPoint = vi.spyOn(document, "elementFromPoint");

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();
    const card = wrapper.get(".movies-home__rail .movie-card");
    await hoverFirstHomeRailCard(wrapper);

    const preview = document.body.querySelector(".movies-trailer-hover-card");
    expect(preview).toBeInstanceOf(HTMLElement);
    elementFromPoint.mockReturnValue(card.element);

    const leaveEvent = new Event("pointerleave", { bubbles: true });
    Object.defineProperties(leaveEvent, {
      clientX: { value: 244 },
      clientY: { value: 184 },
      pointerType: { value: "mouse" },
    });
    preview!.dispatchEvent(leaveEvent);
    await waitForMs(420);
    await nextTick();

    expect(document.body.querySelector(".movies-trailer-hover-card")).not.toBeNull();

    wrapper.unmount();
    elementFromPoint.mockRestore();
    restoreHoverPreview();
  });

  it("reuses one shared trailer preview when moving between Home rail cards", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();
    const secondMovie = movie({
      canonicalPath: "/movie/551-se7en",
      id: "movie-551",
      name: "Se7en",
      slug: "se7en",
      tmdbId: 551,
    });
    const PreviewComponent = defineVaporComponent(
      (props: { args: { videoId: string }; surface: string }) => {
        const preview = document.createElement("div");
        preview.className = "preview-probe";
        watchEffect(() => {
          preview.textContent = `${props.surface}:${props.args.videoId}`;
        });
        return preview;
      },
      { props: ["args", "input", "surface"] },
    );
    const kernel = {
      ...kernelWithTheme("dark"),
      previews: {
        resolve: vi.fn(() => ({
          args: { autoplay: true, videoId: "M7lc1UVf-VE" },
          provider: {
            id: "youtube-player:video-preview",
            manifestId: "youtube-player",
            surfaces: ["movies.trailer"],
            component: () => Promise.resolve(asEsm(PreviewComponent as Component)),
            match: vi.fn(),
          },
        })),
      },
    } as unknown as Kernel;
    vi.mocked(fetchMoviesList).mockResolvedValue(list([movie(), secondMovie]));
    vi.mocked(fetchMovieTrailer).mockResolvedValue(trailerResult());

    const wrapper = mountMovies({
      attachTo: document.body,
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await settle();

    const cards = wrapper.findAll(".movies-home__rail .movie-card");
    const firstRectSpy = vi
      .spyOn(cards[0]!.element, "getBoundingClientRect")
      .mockReturnValue(rect({ height: 270, left: 100, top: 80, width: 180 }));
    const secondRectSpy = vi
      .spyOn(cards[1]!.element, "getBoundingClientRect")
      .mockReturnValue(rect({ height: 270, left: 320, top: 80, width: 180 }));

    await cards[0]!.trigger("pointerenter", { clientX: 240, clientY: 180, pointerType: "mouse" });
    await waitForTrailerPreviewOpen();

    expect(document.body.querySelectorAll(".movies-trailer-hover-card")).toHaveLength(1);
    expect(document.body.querySelector(".movies-trailer-hover-card")?.textContent).toContain(
      "Fight Club",
    );
    const centerLayer = document.body.querySelector(
      ".movies-trailer-hover-card__center",
    ) as HTMLElement | null;
    expect(centerLayer).toBeInstanceOf(HTMLElement);
    expect(centerLayer?.style.getPropertyValue("--movies-trailer-preview-center-x")).toBe("190px");
    expect(centerLayer?.style.getPropertyValue("--movies-trailer-preview-center-y")).toBe("215px");
    expect(centerLayer?.style.transform).toBe("translate3d(190px, 215px, 0) translate(-50%, -50%)");

    await cards[1]!.trigger("pointermove", { clientX: 420, clientY: 180, pointerType: "mouse" });
    await waitForMs(120);
    await flushPromises();
    await nextTick();

    expect(document.body.querySelectorAll(".movies-trailer-hover-card")).toHaveLength(1);
    expect(document.body.querySelector(".movies-trailer-hover-card__center")).toBe(centerLayer);
    expect(centerLayer?.style.getPropertyValue("--movies-trailer-preview-center-x")).toBe("410px");
    expect(centerLayer?.style.getPropertyValue("--movies-trailer-preview-center-y")).toBe("215px");
    expect(centerLayer?.style.transform).toBe("translate3d(410px, 215px, 0) translate(-50%, -50%)");
    expect(document.body.querySelector(".movies-trailer-hover-card")?.textContent).toContain(
      "Se7en",
    );
    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 550);
    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 551);

    firstRectSpy.mockRestore();
    secondRectSpy.mockRestore();
    restoreHoverPreview();
  });

  it("shows an unavailable trailer fallback for Home rail hover previews", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();
    vi.mocked(fetchMovieTrailer).mockResolvedValue({ trailer: null });

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();
    await hoverFirstHomeRailCard(wrapper);

    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 550);
    expect(document.body.textContent).toContain("Trailer unavailable");

    restoreHoverPreview();
  });

  it("does not request trailer previews in hoverless contexts", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability(false);

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();
    await hoverFirstHomeRailCard(wrapper, { waitForPreview: false });

    expect(fetchMovieTrailer).not.toHaveBeenCalled();
    expect(document.body.querySelector(".movies-trailer-hover-card")).toBeNull();

    restoreHoverPreview();
  });

  it("does not request trailer previews in the mobile shell", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability(true);
    document.documentElement.dataset.shell = "mobile";

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();
    await hoverFirstHomeRailCard(wrapper, { waitForPreview: false });

    expect(fetchMovieTrailer).not.toHaveBeenCalled();
    expect(document.body.querySelector(".movies-trailer-hover-card")).toBeNull();

    restoreHoverPreview();
  });

  it("renders Movies home and catalog controls in Vietnamese when locale is vi", async () => {
    useSettingsStore().$patch({ locale: "vi", localeMode: "manual" });

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    expect(wrapper.text()).toContain("Xu hướng tuần này");
    expect(wrapper.text()).toContain("Quốc gia");
    expect(wrapper.text()).toContain("Hàn Quốc");
    expect(wrapper.text()).toContain("Thể loại");
    expect(wrapper.text()).toContain("Hành động");
    expect(wrapper.findAll(".movies-toolbar__menu-button").map((button) => button.text())).toEqual([
      "Phim lẻ",
      "Phim bộ",
    ]);
    expect(wrapper.find('[aria-label="Xem tất cả Xu hướng Phim lẻ"]').exists()).toBe(true);

    await wrapper
      .findAll(".movies-toolbar__menu-button")
      .find((button) => button.text().trim() === "Phim bộ")!
      .trigger("click");
    await settle();

    expect(wrapper.text()).toContain("Phim bộ");
    expect(
      wrapper
        .get('select[aria-label="Loại"]')
        .findAll("option")
        .map((option) => option.text()),
    ).toEqual(["Tất cả", "Phim lẻ", "Phim bộ"]);
    expect(
      wrapper
        .get('select[aria-label="Quốc gia"]')
        .findAll("option")
        .map((option) => option.text()),
    ).toEqual(["Tất cả quốc gia", "Việt Nam", "Hoa Kỳ", "Hàn Quốc"]);
  });

  it("emits app URL changes for the initial home view and detail navigation", async () => {
    const kernel = kernelWithTheme("dark");
    const emit = vi.mocked(kernel.events.emit);
    const appContext: AppContext = Object.freeze({
      manifestId: "movies",
      handleId: "h-movies-test",
      args: Object.freeze({}),
    });
    const wrapper = mountMovies({
      global: {
        provide: {
          [AppContextInjectionKey as symbol]: appContext,
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await settle();

    expect(emit).toHaveBeenCalledWith("app.url.changed", {
      manifestId: "movies",
      handleId: "h-movies-test",
      path: "/apps/movies",
    });

    await wrapper.get(".movies-home__hero-title-button").trigger("click");
    await settle();

    expect(emit).toHaveBeenCalledWith("app.url.changed", {
      manifestId: "movies",
      handleId: "h-movies-test",
      path: "/movie/550-fight-club",
    });
  });

  it("publishes content-aware chrome titles for movie navigation", async () => {
    const setTitle = vi.fn();
    const appChrome: AppChromeController = {
      rendersAppChrome: true,
      setBackAction: vi.fn(),
      setContentSize: vi.fn(),
      setTitle,
      setTitlebar: vi.fn(),
      hide: vi.fn(),
      close: vi.fn(),
    };
    const wrapper = mountMovies({
      global: {
        provide: {
          [AppChromeInjectionKey as symbol]: appChrome,
        },
      },
    });
    await settle();

    expect(setTitle).toHaveBeenLastCalledWith("Movies");

    await wrapper.get(".movies-home__hero-title-button").trigger("click");
    await settle();

    expect(setTitle).toHaveBeenLastCalledWith("Fight Club");
  });

  it("activates clicked desktop featured cards in the hero slider", async () => {
    const scrollTo = vi.fn();
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const heroItems = Array.from({ length: 6 }, (_, index) =>
      movie({
        id: `movie-${index + 1}`,
        name: `Hero ${index + 1}`,
        tmdbId: 550 + index,
      }),
    );
    vi.mocked(fetchMoviesList).mockImplementation(async (query) =>
      list(query.kind === "trending-movie" && query.limit === 6 ? heroItems : [movie()]),
    );

    const wrapper = mountMovies();
    await settle();

    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 1");
    expect(wrapper.find(".movies-home__hero-stepper-count").exists()).toBe(false);

    await wrapper.get('[aria-label="Activate Hero 2"]').trigger("click");
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 2");

    await wrapper.get('[aria-label="Activate Hero 6"]').trigger("click");
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 6");

    requestAnimationFrame.mockRestore();
  });

  it("changes the active featured title with keyboard navigation", async () => {
    const scrollTo = vi.fn();
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const heroItems = Array.from({ length: 6 }, (_, index) =>
      movie({
        id: `movie-${index + 1}`,
        name: `Hero ${index + 1}`,
        tmdbId: 550 + index,
      }),
    );
    vi.mocked(fetchMoviesList).mockImplementation(async (query) =>
      list(query.kind === "trending-movie" && query.limit === 6 ? heroItems : [movie()]),
    );

    const wrapper = mountMovies();
    await settle();

    const loop = wrapper.get(".movies-home__hero-loop");
    const slider = wrapper.get(".movies-home__hero-slider");
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 1");

    await loop.trigger("keydown", { key: "ArrowRight" });
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 2");

    await loop.trigger("keydown", { key: "ArrowLeft" });
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 1");

    await loop.trigger("keydown", { key: "End" });
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 6");

    await loop.trigger("keydown", { key: "Home" });
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 1");

    await loop.trigger("keydown", { key: "ArrowLeft" });
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 6");

    await slider.trigger("keydown", { key: "ArrowRight" });
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 1");

    requestAnimationFrame.mockRestore();
  });

  it("opens Detail from the desktop featured title", async () => {
    const scrollTo = vi.fn();
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    const wrapper = mountMovies();
    await settle();

    await wrapper.get(".movies-home__hero-title-button").trigger("click");
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("movie", 550, expect.anything());
    expect(window.location.pathname).toBe("/movie/550-fight-club");
    expect(wrapper.find(".movies-detail").exists()).toBe(true);

    requestAnimationFrame.mockRestore();
  });

  it("opens Detail when clicking the active desktop featured card", async () => {
    const scrollTo = vi.fn();
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    const wrapper = mountMovies();
    await settle();

    const activeCard = wrapper.get(
      ".movies-home__hero-loop .movies-home__hero-slide--active button",
    );
    await activeCard.trigger("pointerdown", { clientX: 320, clientY: 100, pointerId: 1 });
    await activeCard.trigger("pointerup", { clientX: 320, clientY: 100, pointerId: 1 });
    await wrapper
      .get(".movies-home__hero-loop .movies-home__hero-slide--active button")
      .trigger("click");
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("movie", 550, expect.anything());
    expect(window.location.pathname).toBe("/movie/550-fight-club");
    expect(wrapper.find(".movies-detail").exists()).toBe(true);

    requestAnimationFrame.mockRestore();
  });

  it("supports wrapped activation on the desktop featured slider", async () => {
    const scrollTo = vi.fn();
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const heroItems = Array.from({ length: 6 }, (_, index) =>
      movie({
        id: `movie-${index + 1}`,
        name: `Hero ${index + 1}`,
        tmdbId: 550 + index,
      }),
    );
    vi.mocked(fetchMoviesList).mockImplementation(async (query) =>
      list(query.kind === "trending-movie" && query.limit === 6 ? heroItems : [movie()]),
    );

    const wrapper = mountMovies();
    await settle();

    const loop = wrapper.get(".movies-home__hero-loop");
    expect(loop.findAll(".movies-home__hero-slide")).toHaveLength(6);
    expect(loop.find(".movies-home__hero-track").exists()).toBe(true);

    await wrapper.get('[aria-label="Activate Hero 6"]').trigger("click");
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 6");

    await wrapper.get('[aria-label="Activate Hero 1"]').trigger("click");
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 1");

    await wrapper.get('[aria-label="Activate Hero 2"]').trigger("click");
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 2");

    await wrapper.get('[aria-label="Activate Hero 1"]').trigger("click");
    expect(activeHeroLoopLabel(wrapper)).toBe("Open Hero 1");

    requestAnimationFrame.mockRestore();
  });

  it("renders Continue Watching with one card per movie or TV series newest first", async () => {
    const now = Date.now();
    persistAppProgressEntries({
      [moviePlaybackProgressKey(550)]: {
        currentTime: 30,
        duration: 120,
        updatedAt: now - 1_000,
      },
      [episodePlaybackProgressKey(1399, 1, 2)]: {
        currentTime: 60,
        duration: 120,
        updatedAt: now,
      },
      [episodePlaybackProgressKey(1399, 1, 1)]: {
        currentTime: 42,
        duration: 120,
        updatedAt: now - 500,
      },
    });

    const wrapper = mountMovies();
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("movie", 550, expect.anything());
    expect(fetchMovieEpisode).toHaveBeenCalledWith(1399, 1, 2, expect.anything());
    expect(fetchMovieEpisode).not.toHaveBeenCalledWith(1399, 1, 1, expect.anything());

    const continueSection = wrapper.get(".movies-home__continue");
    expect(continueSection.text()).toContain("Continue Watching");
    const cards = wrapper.findAll(".movies-home__continue-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain("Planet Cinema");
    expect(cards[0]!.text()).toContain("S1 E2");
    expect(cards[0]!.text()).toContain("The Edit");
    expect(cards[0]!.get(".movies-home__continue-progress-value").attributes("style")).toContain(
      "inline-size: 50%;",
    );
    expect(cards[1]!.text()).toContain("Fight Club");
    expect(cards[1]!.get(".movies-home__continue-progress-value").attributes("style")).toContain(
      "inline-size: 25%;",
    );
  });

  it("removes a Continue Watching item from its context menu", async () => {
    const now = Date.now();
    const movieKey = moviePlaybackProgressKey(550);
    const latestEpisodeKey = episodePlaybackProgressKey(1399, 1, 2);
    const olderEpisodeKey = episodePlaybackProgressKey(1399, 1, 1);
    persistAppProgressEntries({
      [movieKey]: {
        currentTime: 30,
        duration: 120,
        updatedAt: now - 1_000,
      },
      [latestEpisodeKey]: {
        currentTime: 60,
        duration: 120,
        updatedAt: now,
      },
      [olderEpisodeKey]: {
        currentTime: 42,
        duration: 120,
        updatedAt: now - 500,
      },
    });

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    const continueEpisode = wrapper
      .findAll(".movies-home__continue-card")
      .find((card) => card.text().includes("Planet Cinema"));
    expect(continueEpisode).toBeDefined();

    dispatchContextMenu(continueEpisode!.element);
    await flushOverlay();

    expect(menuItems().map((node) => node.textContent?.trim())).toEqual([
      "Remove from Continue Watching",
    ]);

    menuItems()[0]!.click();
    await flushOverlay();

    const cards = wrapper.findAll(".movies-home__continue-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]!.text()).toContain("Fight Club");

    const entries = readAppProgressState().entries;
    expect(entries[movieKey]).toBeDefined();
    expect(entries[latestEpisodeKey]).toBeUndefined();
    expect(entries[olderEpisodeKey]).toBeUndefined();
  });

  it("opens a Continue Watching movie directly into autoplay playback", async () => {
    vi.mocked(fetchMovieDetail).mockResolvedValue(detail({ play: playInfo() }));
    persistAppProgress(moviePlaybackProgressKey(550));

    const wrapper = mountMovies();
    await settle();

    const continueMovie = wrapper
      .findAll(".movies-home__continue-card")
      .find((card) => card.text().includes("Fight Club"));
    expect(continueMovie).toBeDefined();
    await continueMovie!.trigger("click");
    await settle();

    expect(window.location.pathname).toBe("/movie/550-fight-club");
    expect(wrapper.find(".movies-watch").exists()).toBe(true);
    expect(wrapper.find(".movies-hls-player").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player").attributes("data-autoplay")).toBe("true");
    expect(wrapper.get(".movies-hls-player").attributes("data-progress-key")).toBe("movie:550");
    expect(wrapper.find(".movies-watch__episode-info").exists()).toBe(false);
  });

  it("opens a Continue Watching movie with the last saved source", async () => {
    const alternateSource = {
      embedUrl: "https://player.example.test/player/?url=fight-club-alt",
      filename: "fight-club-alt.m3u8",
      m3u8Url: "https://stream.example.test/fight-club/alt.m3u8",
      name: "Alt",
      serverName: "Server 2",
      slug: "alt",
    };
    vi.mocked(fetchMovieDetail).mockResolvedValue(
      detail({ play: playInfo({ sources: [playInfo().sources[0]!, alternateSource] }) }),
    );
    persistAppProgress(moviePlaybackProgressKey(550), {
      currentTime: 42,
      duration: 120,
      source: {
        filename: "fight-club-alt.m3u8",
        index: 1,
        m3u8Url: "https://stream.example.test/fight-club/alt.m3u8",
        name: "Alt",
        serverName: "Server 2",
        slug: "alt",
      },
      updatedAt: Date.now(),
    });

    const wrapper = mountMovies();
    await settle();

    const continueMovie = wrapper
      .findAll(".movies-home__continue-card")
      .find((card) => card.text().includes("Fight Club"));
    expect(continueMovie).toBeDefined();
    await continueMovie!.trigger("click");
    await settle();

    expect(wrapper.find(".movies-watch").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player").attributes("data-source-index")).toBe("1");
  });

  it("falls back to the first source when the saved Continue Watching source is unavailable", async () => {
    vi.mocked(fetchMovieDetail).mockResolvedValue(detail({ play: playInfo() }));
    persistAppProgress(moviePlaybackProgressKey(550), {
      currentTime: 42,
      duration: 120,
      source: {
        filename: "fight-club-missing.m3u8",
        index: 1,
        m3u8Url: "https://stream.example.test/fight-club/missing.m3u8",
        name: "Missing",
        serverName: "Server 9",
        slug: "missing",
      },
      updatedAt: Date.now(),
    });

    const wrapper = mountMovies();
    await settle();

    const continueMovie = wrapper
      .findAll(".movies-home__continue-card")
      .find((card) => card.text().includes("Fight Club"));
    expect(continueMovie).toBeDefined();
    await continueMovie!.trigger("click");
    await settle();

    expect(wrapper.find(".movies-watch").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player").attributes("data-source-index")).toBe("0");
  });

  it("uses the last manually selected source when opening another movie", async () => {
    const primarySource = playSource({
      filename: "fight-club-main.m3u8",
      m3u8Url: "https://stream.example.test/fight-club/main.m3u8",
      name: "Full",
      serverName: "Server 1",
      slug: "main",
    });
    const backupSource = playSource({
      filename: "fight-club-backup.m3u8",
      m3u8Url: "https://stream.example.test/fight-club/backup.m3u8",
      name: "Backup",
      serverName: "Server 2",
      slug: "backup",
    });
    const nextPrimarySource = playSource({
      filename: "matrix-main.m3u8",
      m3u8Url: "https://stream.example.test/matrix/main.m3u8",
      name: "Full",
      serverName: "Server 1",
      slug: "main",
    });
    const nextBackupSource = playSource({
      filename: "matrix-backup.m3u8",
      m3u8Url: "https://stream.example.test/matrix/backup.m3u8",
      name: "Backup",
      serverName: "Server 2",
      slug: "backup",
    });
    const matrix = movie({
      canonicalPath: "/movie/551-the-matrix",
      id: "movie-551",
      name: "The Matrix",
      slug: "the-matrix",
      tmdbId: 551,
    });
    vi.mocked(fetchMovieDetail).mockImplementation(async (_mediaType, tmdbId) =>
      tmdbId === 551
        ? detail({
            ...matrix,
            play: playInfo({ slug: "the-matrix", sources: [nextPrimarySource, nextBackupSource] }),
          })
        : detail({ play: playInfo({ sources: [primarySource, backupSource] }) }),
    );
    window.history.replaceState(null, "", "/movie/550-fight-club");

    const wrapper = mountMovies();
    await settle();

    await wrapper
      .get('button.movies-detail-hero__poster-shell--button[aria-label="Play Fight Club"]')
      .trigger("click");
    await settle();
    await wrapper.findAll(".movies-watch__sources-list button")[1]!.trigger("click");
    await settle();

    expect(wrapper.get(".movies-hls-player").attributes("data-source-index")).toBe("1");

    wrapper.unmount();
    window.history.replaceState(null, "", "/movie/551-the-matrix");

    const nextWrapper = mountMovies();
    await settle();

    await nextWrapper
      .get('button.movies-detail-hero__poster-shell--button[aria-label="Play The Matrix"]')
      .trigger("click");
    await settle();

    expect(nextWrapper.get(".movies-hls-player").attributes("data-source-index")).toBe("1");
  });

  it("keeps the item progress source ahead of the global source preference", async () => {
    const primarySource = playSource({
      filename: "fight-club-main.m3u8",
      m3u8Url: "https://stream.example.test/fight-club/main.m3u8",
      name: "Full",
      serverName: "Server 1",
      slug: "main",
    });
    const backupSource = playSource({
      filename: "fight-club-backup.m3u8",
      m3u8Url: "https://stream.example.test/fight-club/backup.m3u8",
      name: "Backup",
      serverName: "Server 2",
      slug: "backup",
    });
    vi.mocked(fetchMovieDetail).mockResolvedValue(
      detail({ play: playInfo({ sources: [primarySource, backupSource] }) }),
    );
    persistAppSourcePreference(backupSource, 1);
    persistAppProgress(moviePlaybackProgressKey(550), {
      currentTime: 42,
      duration: 120,
      source: {
        filename: primarySource.filename,
        index: 0,
        m3u8Url: primarySource.m3u8Url,
        name: primarySource.name,
        serverName: primarySource.serverName,
        slug: primarySource.slug,
      },
      updatedAt: Date.now(),
    });
    window.history.replaceState(null, "", "/movie/550-fight-club");

    const wrapper = mountMovies();
    await settle();

    await wrapper
      .get('button.movies-detail-hero__poster-shell--button[aria-label="Continue Fight Club"]')
      .trigger("click");
    await settle();

    expect(wrapper.get(".movies-hls-player").attributes("data-source-index")).toBe("0");
  });

  it("falls back to the first source when the global source preference is unavailable", async () => {
    const primarySource = playSource({
      filename: "fight-club-main.m3u8",
      m3u8Url: "https://stream.example.test/fight-club/main.m3u8",
      name: "Full",
      serverName: "Server 1",
      slug: "main",
    });
    const backupSource = playSource({
      filename: "fight-club-backup.m3u8",
      m3u8Url: "https://stream.example.test/fight-club/backup.m3u8",
      name: "Backup",
      serverName: "Server 2",
      slug: "backup",
    });
    persistAppSourcePreference(
      playSource({
        filename: "missing.m3u8",
        m3u8Url: "https://stream.example.test/missing.m3u8",
        name: "Missing",
        serverName: "Server 9",
        slug: "missing",
      }),
      1,
    );
    vi.mocked(fetchMovieDetail).mockResolvedValue(
      detail({ play: playInfo({ sources: [primarySource, backupSource] }) }),
    );
    window.history.replaceState(null, "", "/movie/550-fight-club");

    const wrapper = mountMovies();
    await settle();

    await wrapper
      .get('button.movies-detail-hero__poster-shell--button[aria-label="Play Fight Club"]')
      .trigger("click");
    await settle();

    expect(wrapper.get(".movies-hls-player").attributes("data-source-index")).toBe("0");
  });

  it("opens a Continue Watching TV episode directly into autoplay playback", async () => {
    const season = seasonDetail();
    const episode = { ...season.episodes[0]!, play: playInfo({ slug: "planet-cinema" }) };
    vi.mocked(fetchMovieEpisode).mockResolvedValue(
      episodeDetail({ episode, season: { ...season, episodes: [episode, season.episodes[1]!] } }),
    );
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());
    persistAppProgress(episodePlaybackProgressKey(1399, 1, 1));

    const wrapper = mountMovies();
    await settle();

    const continueEpisode = wrapper
      .findAll(".movies-home__continue-card")
      .find((card) => card.text().includes("Planet Cinema"));
    expect(continueEpisode).toBeDefined();
    await continueEpisode!.trigger("click");
    await settle();

    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/1/episode/1");
    expect(wrapper.find(".movies-watch").exists()).toBe(true);
    expect(wrapper.find(".movies-hls-player").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player").attributes("data-autoplay")).toBe("true");
    expect(wrapper.get(".movies-hls-player").attributes("data-progress-key")).toBe(
      episodePlaybackProgressKey(1399, 1, 1),
    );
    const episodeInfo = wrapper.get(".movies-watch__episode-info");
    expect(episodeInfo.text()).toContain("Planet Cinema");
    expect(episodeInfo.text()).toContain("Season 1");
    expect(episodeInfo.text()).toContain("Pilot");
    expect(episodeInfo.text()).toContain("Episode 1 · 2024-01-01 · 42 min · 7.8 rating");
    expect(episodeInfo.text()).toContain("Pilot overview.");

    await wrapper.get("select.movies-season-episodes__season-select").setValue("2");
    await settle();

    expect(fetchMovieSeason).toHaveBeenLastCalledWith(1399, 2, expect.anything());
    expect(wrapper.text()).toContain("Second Premiere");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/1/episode/1");

    await wrapper.get(".movies-watch__series-link").trigger("click");
    await settle();

    expect(wrapper.find(".movies-watch").exists()).toBe(false);
    expect(wrapper.find(".movies-detail").exists()).toBe(true);
    expect(wrapper.text()).toContain("Seasons");
    expect(wrapper.text()).toContain("Season 2");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema");
  });

  it("hides Continue Watching when progress hydration fails", async () => {
    persistAppProgress(moviePlaybackProgressKey(550));
    vi.mocked(fetchMovieDetail).mockRejectedValueOnce(new Error("No title"));

    const wrapper = mountMovies();
    await settle();

    expect(wrapper.find(".movies-home__continue").exists()).toBe(false);
  });

  it("shows the toolbar background only after the current view scrolls", async () => {
    const wrapper = mountMovies();
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

  it("opens catalog lists from the toolbar menus", async () => {
    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    expect(wrapper.findAll(".movies-toolbar__menu-button").map((button) => button.text())).toEqual([
      "Movies",
      "TV Shows",
    ]);

    vi.mocked(fetchMoviesList).mockClear();
    await wrapper
      .findAll(".movies-toolbar__menu-button")
      .find((button) => button.text().trim() === "TV Shows")!
      .trigger("click");
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: DEFAULT_MOVIES_LIST_LIMIT,
        media: "tv",
        page: 1,
      }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("TV Shows");
    expect(
      wrapper
        .get('select[aria-label="Type"]')
        .findAll("option")
        .map((option) => option.text()),
    ).toEqual(["All", "Movies", "TV Shows"]);
    expect(
      wrapper
        .get('select[aria-label="Country"]')
        .findAll("option")
        .map((option) => option.text()),
    ).toEqual(["All countries", "Vietnam", "United States of America", "South Korea"]);

    await wrapper.get('select[aria-label="Genre"]').setValue("18");
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        genre: 18,
        genreName: "Drama",
        limit: DEFAULT_MOVIES_LIST_LIMIT,
        media: "tv",
        page: 1,
      }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("TV Shows · Drama");

    await wrapper.get('select[aria-label="Country"]').setValue("KR");
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        country: "KR",
        countryName: "South Korea",
        genre: 18,
        genreName: "Drama",
        limit: DEFAULT_MOVIES_LIST_LIMIT,
        media: "tv",
        page: 1,
      }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("TV Shows · Drama · South Korea");

    await wrapper.get('select[aria-label="Type"]').setValue("all");
    await settle();

    const [allQuery] = vi.mocked(fetchMoviesList).mock.calls.at(-1)!;
    expect(allQuery).toEqual(
      expect.objectContaining({
        country: "KR",
        countryName: "South Korea",
        limit: DEFAULT_MOVIES_LIST_LIMIT,
        media: "all",
        page: 1,
      }),
    );
    expect(allQuery).not.toHaveProperty("genre");
    expect(wrapper.text()).toContain("All Titles · South Korea");
  });

  it("switches Home Trending period", async () => {
    const wrapper = mountMovies();
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
    expect(wrapper.find('[aria-label="Popular period"]').exists()).toBe(false);
  });

  it("keeps Home content mounted while a period refresh is loading", async () => {
    const wrapper = mountMovies();
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

  it("keeps catalog controls visible while list results are loading", async () => {
    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    let resolveCatalogList!: (result: MoviesListResult) => void;
    const catalogListResult = new Promise<MoviesListResult>((resolve) => {
      resolveCatalogList = resolve;
    });
    vi.mocked(fetchMoviesList).mockImplementation(() => catalogListResult);

    await wrapper
      .findAll(".movies-toolbar__menu-button")
      .find((button) => button.text().trim() === "TV Shows")!
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("TV Shows");
    expect(wrapper.find(".movies-list__filters").exists()).toBe(true);
    expect(wrapper.find('select[aria-label="Type"]').exists()).toBe(true);
    expect(wrapper.find('select[aria-label="Genre"]').exists()).toBe(true);
    expect(wrapper.find(".movies-loading-overlay").exists()).toBe(false);
    expect(wrapper.find('.movies-list__results[aria-busy="true"]').exists()).toBe(true);
    expect(wrapper.find(".movies-list__loading").exists()).toBe(true);

    resolveCatalogList(list([movie({ id: "tv-1399", mediaType: "tv", name: "Planet Cinema" })]));
    await settle();

    expect(wrapper.find('.movies-list__results[aria-busy="false"]').exists()).toBe(true);
    expect(wrapper.find(".movies-list__loading").exists()).toBe(false);
    expect(wrapper.text()).toContain("Planet Cinema");
  });

  it("loads and renders a trailer preview when hovering a catalog list card", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    await wrapper
      .findAll(".movies-toolbar__menu-button")
      .find((button) => button.text().trim() === "Movies")!
      .trigger("click");
    await settle();
    await hoverFirstListCard(wrapper);

    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 550);
    const preview = document.body.querySelector(".movies-trailer-hover-card");
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain("Fight Club");

    restoreHoverPreview();
  });

  it("keeps the load more button visible with a spinner while fetching the next page", async () => {
    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    vi.mocked(fetchMoviesList).mockResolvedValueOnce(
      list([movie()], {
        totalItems: 2,
        currentPage: 1,
        totalPages: 2,
      }),
    );

    await wrapper
      .findAll(".movies-toolbar__menu-button")
      .find((button) => button.text().trim() === "Movies")!
      .trigger("click");
    await settle();

    let resolveNextPage!: (result: MoviesListResult) => void;
    const nextPageResult = new Promise<MoviesListResult>((resolve) => {
      resolveNextPage = resolve;
    });
    vi.mocked(fetchMoviesList).mockImplementationOnce(() => nextPageResult);

    await wrapper.get(".movies-list__load-more").trigger("click");
    await nextTick();

    const loadingButton = wrapper.get<HTMLButtonElement>(".movies-list__load-more");
    expect(loadingButton.attributes("aria-busy")).toBe("true");
    expect(loadingButton.element.disabled).toBe(true);
    expect(loadingButton.classes()).toContain("ds-button--loading");
    expect(loadingButton.find(".ds-button__spinner").exists()).toBe(true);
    expect(loadingButton.text()).toBe("");
    expect(loadingButton.attributes("aria-label")).toBe("Load more");
    expect(wrapper.text()).toContain("Fight Club");

    resolveNextPage(
      list([movie({ id: "movie-551", name: "Page Two", tmdbId: 551 })], {
        totalItems: 2,
        currentPage: 2,
        totalPages: 2,
      }),
    );
    await settle();

    expect(wrapper.text()).toContain("Page Two");
    expect(wrapper.find(".movies-list__load-more").exists()).toBe(false);
  });

  it("keeps search controls visible while search results are loading", async () => {
    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    await wrapper.get(".movies-toolbar__search-button").trigger("click");
    await settle();

    let resolveSearchList!: (result: MoviesListResult) => void;
    const searchListResult = new Promise<MoviesListResult>((resolve) => {
      resolveSearchList = resolve;
    });
    vi.mocked(fetchMoviesList).mockImplementation(() => searchListResult);

    const moviesApp = wrapper.get(".movies-app").element;
    const searchInput = moviesApp.querySelector<HTMLInputElement>(
      'input[type="search"][aria-label="Search movies"]',
    );
    expect(searchInput).toBeInstanceOf(HTMLInputElement);
    searchInput!.value = "Matrix";
    searchInput!.dispatchEvent(new Event("input", { bubbles: true }));

    const searchForm = moviesApp.querySelector<HTMLFormElement>('form[role="search"]');
    expect(searchForm).toBeInstanceOf(HTMLFormElement);
    searchForm!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(wrapper.text()).toContain("Search: Matrix");
    expect(wrapper.find(".movies-list__search-panel").exists()).toBe(true);
    expect(
      wrapper.find('.movies-list__search-input-shell input[aria-label="Keyword"]').exists(),
    ).toBe(true);
    expect(wrapper.find(".movies-list__tabs").exists()).toBe(true);
    expect(wrapper.find('select[aria-label="Genre"]').exists()).toBe(false);
    expect(wrapper.find(".movies-loading-overlay").exists()).toBe(false);
    expect(wrapper.find('.movies-list__results[aria-busy="true"]').exists()).toBe(true);
    expect(wrapper.find(".movies-list__loading").exists()).toBe(true);

    resolveSearchList(list([movie({ id: "movie-603", name: "The Matrix", tmdbId: 603 })]));
    await settle();

    expect(wrapper.find('.movies-list__results[aria-busy="false"]').exists()).toBe(true);
    expect(wrapper.find(".movies-list__loading").exists()).toBe(false);
    expect(wrapper.text()).toContain("The Matrix");
  });

  it("loads and renders a trailer preview when hovering a search result card", async () => {
    const restoreHoverPreview = stubHoverPreviewCapability();

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    await wrapper.get(".movies-toolbar__search-button").trigger("click");
    await settle();

    const moviesApp = wrapper.get(".movies-app").element;
    const searchInput = moviesApp.querySelector<HTMLInputElement>(
      'input[type="search"][aria-label="Search movies"]',
    );
    expect(searchInput).toBeInstanceOf(HTMLInputElement);
    searchInput!.value = "Fight";
    searchInput!.dispatchEvent(new Event("input", { bubbles: true }));

    const searchForm = moviesApp.querySelector<HTMLFormElement>('form[role="search"]');
    expect(searchForm).toBeInstanceOf(HTMLFormElement);
    searchForm!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    await hoverFirstListCard(wrapper);

    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 550);
    const preview = document.body.querySelector(".movies-trailer-hover-card");
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain("Fight Club");

    restoreHoverPreview();
  });

  it("opens a clear keyword search list from toolbar search and switches media tabs", async () => {
    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    expect(wrapper.find(".movies-list__search-panel").exists()).toBe(false);

    await wrapper.get(".movies-toolbar__search-button").trigger("click");
    await settle();

    const moviesApp = wrapper.get(".movies-app").element;
    const dialog = moviesApp.querySelector('[role="dialog"]');
    const overlay = moviesApp.querySelector(".ds-dialog__overlay");
    expect(dialog).toBeInstanceOf(HTMLElement);
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(dialog?.classList.contains("ds-dialog__content--container")).toBe(true);
    expect(overlay?.classList.contains("ds-dialog__overlay--container")).toBe(true);
    expect(dialog?.querySelector("h2")?.textContent).toBe("Search");
    expect(dialog?.textContent).not.toContain("Movies and TV");

    const searchInput = moviesApp.querySelector<HTMLInputElement>(
      'input[type="search"][aria-label="Search movies"]',
    );
    expect(searchInput).toBeInstanceOf(HTMLInputElement);
    searchInput!.value = "Fight";
    searchInput!.dispatchEvent(new Event("input", { bubbles: true }));

    const searchForm = moviesApp.querySelector<HTMLFormElement>('form[role="search"]');
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
    expect(moviesApp.querySelector('[role="dialog"]')).toBeNull();

    const keywordInput = wrapper.get<HTMLInputElement>(
      '.movies-list__search-input-shell input[type="search"][aria-label="Keyword"]',
    );
    expect(keywordInput.element.value).toBe("Fight");
    expect(wrapper.find('select[aria-label="Genre"]').exists()).toBe(false);
    expect(wrapper.find('select[aria-label="Country"]').exists()).toBe(false);
    expect(wrapper.find('select[aria-label="Sort"]').exists()).toBe(false);

    keywordInput.element.value = "Matrix";
    keywordInput.element.dispatchEvent(new Event("input", { bubbles: true }));
    await wrapper.get(".movies-list__search-form").trigger("submit");
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyword: "Matrix",
        limit: DEFAULT_MOVIES_LIST_LIMIT,
        media: "all",
        page: 1,
      }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("Search: Matrix");

    const moviesTab = wrapper
      .findAll(".movies-list__tabs button")
      .find((button) => button.text().trim() === "Movies");
    expect(moviesTab).toBeDefined();
    await moviesTab!.trigger("click");
    await settle();

    expect(fetchMoviesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyword: "Matrix",
        limit: DEFAULT_MOVIES_LIST_LIMIT,
        media: "movie",
        page: 1,
      }),
      expect.anything(),
    );
    expect(wrapper.text()).toContain("Search Movies: Matrix");
  });

  it("opens Detail on canonical TMDB routes and keeps Watch hidden", async () => {
    const wrapper = mountMovies();
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("movie", 550, expect.anything());
    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 550, expect.anything());
    expect(window.location.pathname).toBe("/movie/550-fight-club");
    expect(wrapper.text()).toContain("Fight Club");
    expect(wrapper.text()).toContain("Details");
    expect(wrapper.find(".movies-detail-hero__trailer").exists()).toBe(false);
    expect(wrapper.get("picture.movies-detail-hero__backdrop img").attributes("src")).toBe(
      "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    );
    expect(wrapper.get("picture.movies-detail-hero__backdrop source").attributes()).toMatchObject({
      media: "(max-width: 700px)",
      srcset: "https://image.tmdb.org/t/p/w500/poster.jpg",
    });
    expect(wrapper.get(".movies-detail-section__description").text()).toBe(
      "An insomniac office worker meets a soap maker.",
    );
    expect(wrapper.text()).toContain("Edward Norton");
    expect(wrapper.text()).toContain("David Fincher");
    expect(wrapper.find(".movies-detail-people__placeholder").exists()).toBe(true);
    expect(wrapper.findAll("button").some((button) => button.text().trim() === "Watch")).toBe(
      false,
    );
    expect(wrapper.find(".movies-hls-player").exists()).toBe(false);
  });

  it("uses a resolved trailer preview as the Detail hero cover", async () => {
    const PreviewComponent = defineVaporComponent(
      (
        props: {
          args: { autoplay: boolean; videoId: string };
          input: { kind: string };
          surface: string;
        },
        { emit },
      ) => {
        const root = document.createElement("div");
        const preview = document.createElement("span");
        preview.className = "preview-probe";
        preview.textContent = `${props.surface}:${props.args.videoId}:${String(props.args.autoplay)}:${props.input.kind}`;
        const playing = document.createElement("button");
        playing.type = "button";
        playing.className = "preview-playing";
        playing.textContent = "Playing";
        playing.addEventListener("click", () => emit("playing"));
        const ended = document.createElement("button");
        ended.type = "button";
        ended.className = "preview-ended";
        ended.textContent = "Ended";
        ended.addEventListener("click", () => emit("ended"));
        root.append(preview, playing, ended);
        return root;
      },
      { props: ["args", "input", "surface"], emits: ["ended", "playing"] },
    );
    const provider = {
      id: "youtube-player:video-preview",
      manifestId: "youtube-player",
      surfaces: ["movies.trailer"],
      component: () => Promise.resolve(asEsm(PreviewComponent as Component)),
      match: vi.fn(),
    };
    const resolve = vi.fn(() => ({
      args: { autoplay: true, videoId: "M7lc1UVf-VE" },
      provider,
    }));
    const kernel = {
      ...kernelWithTheme("dark"),
      previews: { resolve },
    } as unknown as Kernel;
    vi.mocked(fetchMovieTrailer).mockResolvedValue(trailerResult());

    const wrapper = mountMovies({
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();
    await nextTick();

    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 550, expect.anything());
    expect(wrapper.find(".movies-detail-hero__trailer").exists()).toBe(true);
    expect(wrapper.get(".movies-detail-hero__trailer").classes()).not.toContain(
      "movies-detail-hero__trailer--visible",
    );
    expect(wrapper.get("picture.movies-detail-hero__backdrop img").attributes("src")).toBe(
      "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    );
    expect(resolve).toHaveBeenCalledWith(
      {
        kind: "url",
        url: "youtube-player://video/M7lc1UVf-VE?autoplay=1&fit=cover",
      },
      { surface: "movies.trailer" },
    );
    expect(wrapper.get(".preview-probe").text()).toBe("movies.trailer:M7lc1UVf-VE:true:url");

    await wrapper.get(".preview-playing").trigger("click");
    await nextTick();

    expect(wrapper.get(".movies-detail-hero__trailer").classes()).toContain(
      "movies-detail-hero__trailer--visible",
    );
    expect(wrapper.find("picture.movies-detail-hero__backdrop").exists()).toBe(true);

    await wrapper.get(".preview-ended").trigger("click");
    await nextTick();

    expect(wrapper.find(".movies-detail-hero__trailer").exists()).toBe(false);
    expect(wrapper.get("picture.movies-detail-hero__backdrop img").attributes("src")).toBe(
      "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    );
  });

  it("falls back to the Detail backdrop when no trailer preview provider resolves", async () => {
    const resolve = vi.fn(() => null);
    const kernel = {
      ...kernelWithTheme("dark"),
      previews: { resolve },
    } as unknown as Kernel;
    vi.mocked(fetchMovieTrailer).mockResolvedValue(trailerResult());

    const wrapper = mountMovies({
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    expect(resolve).toHaveBeenCalledWith(
      {
        kind: "url",
        url: "youtube-player://video/M7lc1UVf-VE?autoplay=1&fit=cover",
      },
      { surface: "movies.trailer" },
    );
    expect(wrapper.find(".movies-detail-hero__trailer").exists()).toBe(false);
    expect(wrapper.get("picture.movies-detail-hero__backdrop img").attributes("src")).toBe(
      "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    );
  });

  it("keeps Detail rendered with the image cover when trailer loading fails", async () => {
    vi.mocked(fetchMovieTrailer).mockRejectedValueOnce(new Error("Trailer failed"));

    const wrapper = mountMovies();
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("movie", 550, expect.anything());
    expect(fetchMovieTrailer).toHaveBeenCalledWith("movie", 550, expect.anything());
    expect(wrapper.text()).toContain("Fight Club");
    expect(wrapper.find(".movies-detail-hero__trailer").exists()).toBe(false);
    expect(wrapper.get("picture.movies-detail-hero__backdrop img").attributes("src")).toBe(
      "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
    );
  });

  it("opens WatchView from Detail thumbnail when a movie has a play source", async () => {
    vi.mocked(fetchMovieDetail).mockResolvedValue(detail({ play: playInfo() }));

    const wrapper = mountMovies();
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    const playButton = wrapper.get(
      'button.movies-detail-hero__poster-shell--button[aria-label="Play Fight Club"]',
    );
    expect(wrapper.findAll("button").some((button) => button.text().trim() === "Watch")).toBe(
      false,
    );
    expect(wrapper.find(".movies-hls-player").exists()).toBe(false);

    await playButton.trigger("click");
    await settle();

    expect(wrapper.find(".movies-watch").exists()).toBe(true);
    expect(wrapper.find(".movies-toolbar").exists()).toBe(false);
    expect(wrapper.find(".movies-hls-player").exists()).toBe(true);
    expect(wrapper.find(".movies-hls-player__back-button").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player").attributes("data-autoplay")).toBe("true");
    expect(wrapper.get(".movies-hls-player").attributes("data-progress-key")).toBe("movie:550");
    expect(wrapper.find("video").exists()).toBe(true);

    await wrapper.get(".movies-hls-player__back-button").trigger("click");
    await settle();

    expect(wrapper.find(".movies-watch").exists()).toBe(false);
    expect(wrapper.find(".movies-detail").exists()).toBe(true);
    expect(wrapper.find(".movies-hls-player").exists()).toBe(false);
    expect(wrapper.find(".movies-toolbar").exists()).toBe(true);
    expect(window.location.pathname).toBe("/movie/550-fight-club");
  });

  it("forwards watch keyboard events from the Movies app level to the player", async () => {
    vi.mocked(fetchMovieDetail).mockResolvedValue(detail({ play: playInfo() }));

    const wrapper = mountMovies({ attachTo: document.body });
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    const playButton = wrapper.get(
      'button.movies-detail-hero__poster-shell--button[aria-label="Play Fight Club"]',
    );

    await playButton.trigger("click");
    await settle();

    movieHlsPlayerHandleAppKeydown.mockClear();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    });
    window.dispatchEvent(event);

    expect(movieHlsPlayerHandleAppKeydown).toHaveBeenCalledTimes(1);
    expect(movieHlsPlayerHandleAppKeydown).toHaveBeenCalledWith(event);

    wrapper.unmount();
  });

  it("opens movie detail thumbnail with saved progress", async () => {
    vi.mocked(fetchMovieDetail).mockResolvedValue(detail({ play: playInfo() }));
    persistAppProgress(moviePlaybackProgressKey(550));

    const wrapper = mountMovies();
    await settle();

    await wrapper.get(".movie-card").trigger("click");
    await settle();

    const continueButton = wrapper.get(
      'button.movies-detail-hero__poster-shell--button[aria-label="Continue Fight Club"]',
    );
    expect(wrapper.text()).not.toContain("Continue");
    expect(wrapper.find(".movies-hls-player").exists()).toBe(false);

    await continueButton.trigger("click");
    await settle();

    expect(wrapper.find(".movies-watch").exists()).toBe(true);
    expect(wrapper.find(".movies-hls-player").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player").attributes("data-autoplay")).toBe("true");
    expect(wrapper.get(".movies-hls-player").attributes("data-progress-key")).toBe("movie:550");
  });

  it("keeps Home and mobile catalog icons in the toolbar history cluster", async () => {
    const wrapper = mountMovies();
    await settle();

    const toolbarHistory = wrapper.get(".movies-toolbar__history");
    const backButton = () => toolbarHistory.get('button[aria-label="Back"]');
    const forwardButton = () => toolbarHistory.get('button[aria-label="Forward"]');
    const homeButton = () => toolbarHistory.get('button[aria-label="Home"]');

    expect(toolbarHistory.text()).not.toContain("Movies");
    expect(
      toolbarHistory.findAll("button").map((button) => button.attributes("aria-label")),
    ).toEqual(["Back", "Forward", "Home", "Movies", "TV Shows"]);
    expect(wrapper.findAll(".movies-toolbar__menu-button").map((button) => button.text())).toEqual([
      "Movies",
      "TV Shows",
    ]);
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

    const wrapper = mountMovies({
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
    const wrapper = mountMovies();
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
    const wrapper = mountMovies();
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
    expect(window.location.pathname).toBe("/tmdb/person/819-edward-norton");
    expect(wrapper.text()).toContain("Biography");
    expect(wrapper.text()).toContain("Edward Norton is an American actor and filmmaker.");
    expect(wrapper.text()).toContain("Known For");
    expect(wrapper.text()).toContain("Fight Club");
  });

  it("opens a direct person route", async () => {
    window.history.replaceState(null, "", "/tmdb/person/819-edward-norton");

    const wrapper = mountMovies();
    await settle();

    expect(fetchMoviePerson).toHaveBeenCalledWith(819, expect.anything());
    expect(wrapper.text()).toContain("Edward Norton");
    expect(wrapper.text()).toContain("Details");
    expect(window.location.pathname).toBe("/tmdb/person/819-edward-norton");
  });

  it("opens a direct TV route into Detail", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());

    const wrapper = mountMovies();
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("tv", 1399, expect.anything());
    expect(wrapper.text()).toContain("Planet Cinema");
    expect(wrapper.text()).toContain("Seasons");
    expect(wrapper.text()).toContain("10 episodes");
    expect(fetchMovieSeason).toHaveBeenCalledWith(1399, 1, expect.anything());
    expect(wrapper.text()).toContain("Episodes");
    expect(wrapper.text()).toContain("Pilot");
    expect(wrapper.find(".movies-episode-list__media").exists()).toBe(true);
    expect(wrapper.find(".movies-episode-list__overview").text()).toBe("Pilot overview.");
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

  it("canonicalizes localized direct TV routes", async () => {
    window.history.replaceState(null, "", "/vi/tv/1399-planet-cinema");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const pushSpy = vi.spyOn(window.history, "pushState");

    const wrapper = mountMovies();
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("tv", 1399, expect.anything());
    expect(wrapper.text()).toContain("Planet Cinema");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema");
    expect(replaceSpy).toHaveBeenCalledWith(null, "", "/tv/1399-planet-cinema");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("opens episode detail from a TV detail episode row", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());

    const wrapper = mountMovies();
    await settle();

    const pilotButton = wrapper
      .findAll(".movies-episode-list__item")
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

  it("opens a direct season route", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema/season/2");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());

    const wrapper = mountMovies();
    await settle();

    expect(fetchMovieDetail).toHaveBeenCalledWith("tv", 1399, expect.anything());
    expect(fetchMovieSeason).toHaveBeenCalledWith(1399, 2, expect.anything());
    expect(wrapper.text()).toContain("Planet Cinema: Season 2");
    expect(wrapper.text()).toContain("Second Premiere");
    expect(wrapper.text()).toContain("Series Cast");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/2");

    const episodeButton = wrapper
      .findAll(".movies-episode-list__item")
      .find((button) => button.text().includes("Second Premiere"));
    expect(episodeButton).toBeDefined();
    await episodeButton!.trigger("click");
    await settle();

    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/2/episode/1");
    expect(fetchMovieEpisode).toHaveBeenCalledWith(1399, 2, 1, expect.anything());
    expect(wrapper.text()).toContain("Episode Details");
  });

  it("opens a direct episode route", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema/season/1/episode/2");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());

    const wrapper = mountMovies();
    await settle();

    expect(fetchMovieEpisode).toHaveBeenCalledWith(1399, 1, 2, expect.anything());
    expect(wrapper.text()).toContain("The Edit");
    expect(wrapper.text()).toContain("Episode Details");
    expect(wrapper.find(".movies-hls-player").exists()).toBe(false);
    expect(wrapper.find(".movies-episode__still").exists()).toBe(true);
    expect(wrapper.find(".movies-episode-list__media").exists()).toBe(true);
    expect(wrapper.find(".movies-episode-list__overview").text()).toBe("Pilot overview.");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/1/episode/2");

    await wrapper.get("select.movies-season-episodes__season-select").setValue("2");
    await settle();

    expect(fetchMovieSeason).toHaveBeenLastCalledWith(1399, 2, expect.anything());
    expect(wrapper.text()).toContain("Second Premiere");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/1/episode/2");

    await wrapper.get(".movies-episode__series-link").trigger("click");
    await settle();

    expect(wrapper.find(".movies-episode").exists()).toBe(false);
    expect(wrapper.find(".movies-detail").exists()).toBe(true);
    expect(wrapper.text()).toContain("Seasons");
    expect(wrapper.text()).toContain("Season 2");
    expect(window.location.pathname).toBe("/tv/1399-planet-cinema");
  });

  it("opens WatchView from an episode detail route with a play source", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema/season/1/episode/1");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());
    const season = seasonDetail();
    const episode = { ...season.episodes[0]!, play: playInfo({ slug: "planet-cinema" }) };
    vi.mocked(fetchMovieEpisode).mockResolvedValue(
      episodeDetail({ episode, season: { ...season, episodes: [episode, season.episodes[1]!] } }),
    );

    const wrapper = mountMovies();
    await settle();

    expect(fetchMovieEpisode).toHaveBeenCalledWith(1399, 1, 1, expect.anything());
    expect(wrapper.find(".movies-hls-player").exists()).toBe(false);
    expect(wrapper.find(".movies-episode__still").exists()).toBe(true);
    expect(wrapper.find(".movies-episode__play-overlay").exists()).toBe(true);
    expect(wrapper.find(".movies-episode-list__play-overlay").exists()).toBe(true);

    const playButton = wrapper.get('button.movies-episode__media--button[aria-label="Play Pilot"]');
    expect(wrapper.findAll("button").some((button) => button.text().trim() === "Watch")).toBe(
      false,
    );
    await playButton.trigger("click");
    await settle();

    expect(wrapper.find(".movies-watch").exists()).toBe(true);
    expect(wrapper.find(".movies-hls-player").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player").attributes("data-autoplay")).toBe("true");
    expect(wrapper.get(".movies-hls-player").attributes("data-progress-key")).toBe(
      episodePlaybackProgressKey(1399, 1, 1),
    );
    expect(wrapper.find("video").exists()).toBe(true);
    const episodeInfo = wrapper.get(".movies-watch__episode-info");
    expect(episodeInfo.text()).toContain("Planet Cinema");
    expect(episodeInfo.text()).toContain("Season 1");
    expect(episodeInfo.text()).toContain("Pilot");
    expect(episodeInfo.text()).toContain("Episode 1 · 2024-01-01 · 42 min · 7.8 rating");
    expect(episodeInfo.text()).toContain("Pilot overview.");
  });

  it("plays the next episode from the player when a playable next episode exists", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema/season/1/episode/1");
    vi.mocked(fetchMovieDetail).mockResolvedValue(tvDetail());
    const season = seasonDetail();
    const firstPrimarySource = playSource({
      filename: "planet-cinema-e1-main.m3u8",
      m3u8Url: "https://stream.example.test/planet-cinema/e1/main.m3u8",
      name: "Main",
      serverName: "Server 1",
      slug: "main",
    });
    const firstBackupSource = playSource({
      filename: "planet-cinema-e1-backup.m3u8",
      m3u8Url: "https://stream.example.test/planet-cinema/e1/backup.m3u8",
      name: "Backup",
      serverName: "Server 2",
      slug: "backup",
    });
    const secondPrimarySource = playSource({
      filename: "planet-cinema-e2-main.m3u8",
      m3u8Url: "https://stream.example.test/planet-cinema/e2/main.m3u8",
      name: "Main",
      serverName: "Server 1",
      slug: "main",
    });
    const secondBackupSource = playSource({
      filename: "planet-cinema-e2-backup.m3u8",
      m3u8Url: "https://stream.example.test/planet-cinema/e2/backup.m3u8",
      name: "Backup",
      serverName: "Server 2",
      slug: "backup",
    });
    const firstEpisode = {
      ...season.episodes[0]!,
      play: playInfo({
        slug: "planet-cinema-1",
        sources: [firstPrimarySource, firstBackupSource],
      }),
    };
    const secondEpisode = {
      ...season.episodes[1]!,
      play: playInfo({
        slug: "planet-cinema-2",
        sources: [secondPrimarySource, secondBackupSource],
      }),
    };
    const playableSeason = { ...season, episodes: [firstEpisode, secondEpisode] };
    vi.mocked(fetchMovieEpisode).mockImplementation(async (_tmdbId, _seasonNumber, episodeNumber) =>
      episodeDetail({
        episode: episodeNumber === 1 ? firstEpisode : secondEpisode,
        season: playableSeason,
      }),
    );
    persistAppProgressEntries({
      [episodePlaybackProgressKey(1399, 1, 1)]: {
        currentTime: 42,
        duration: 120,
        source: moviesPlaybackProgressSourceSnapshot(firstBackupSource, 1),
        updatedAt: Date.now(),
      },
      [episodePlaybackProgressKey(1399, 1, 2)]: {
        currentTime: 42,
        duration: 120,
        source: moviesPlaybackProgressSourceSnapshot(secondPrimarySource, 0),
        updatedAt: Date.now(),
      },
    });

    const wrapper = mountMovies();
    await settle();

    const playButton = wrapper.get('button.movies-episode__media--button[aria-label="Play Pilot"]');
    await playButton.trigger("click");
    await settle();

    expect(wrapper.get(".movies-hls-player").attributes("data-next-episode-label")).toBe(
      "Next episode: Episode 2 - The Edit",
    );
    expect(wrapper.get(".movies-hls-player").attributes("data-source-index")).toBe("1");

    await wrapper.get(".movies-hls-player__speed-probe").trigger("click");
    await settle();

    await wrapper.get(".movies-hls-player__next-episode-button").trigger("click");
    await settle();

    expect(window.location.pathname).toBe("/tv/1399-planet-cinema/season/1/episode/2");
    expect(wrapper.get(".movies-hls-player").attributes("data-autoplay")).toBe("true");
    expect(wrapper.get(".movies-hls-player").attributes("data-progress-key")).toBe(
      episodePlaybackProgressKey(1399, 1, 2),
    );
    expect(wrapper.get(".movies-hls-player").attributes("data-source-index")).toBe("1");
    expect(wrapper.get(".movies-hls-player").attributes("data-playback-speed")).toBe("1.5");
    expect(wrapper.get(".movies-hls-player").attributes("data-title")).toBe("The Edit");
    expect(wrapper.find(".movies-hls-player__next-episode-button").exists()).toBe(false);
  });

  it("ignores unsupported detail routes", async () => {
    window.history.replaceState(null, "", "/legacy/kieu-so");
    const wrapper = mountMovies();
    await settle();

    expect(fetchMovieDetail).not.toHaveBeenCalled();
    expect(wrapper.find(".movies-home").exists()).toBe(true);
    expect(window.location.pathname).toBe("/apps/movies");
  });

  it("shows home for invalid public media routes", async () => {
    window.history.replaceState(null, "", "/tv/1399-planet-cinema/season/01");
    const wrapper = mountMovies();
    await settle();

    expect(fetchMovieDetail).not.toHaveBeenCalled();
    expect(fetchMovieSeason).not.toHaveBeenCalled();
    expect(wrapper.find(".movies-home").exists()).toBe(true);
    expect(window.location.pathname).toBe("/apps/movies");
  });

  it("accepts TMDB launch args instead of movieSlug", async () => {
    mountMovies({
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
