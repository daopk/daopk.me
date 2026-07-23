// @vitest-environment happy-dom

import { flushPromises, mountVaporTest as mount, type VaporTestWrapper } from "~/test/mountVapor";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import MovieHlsPlayer from "./MovieHlsPlayer.vue";
import type { MoviePlayInfo, MoviePlaySource } from "../moviesApi";
import {
  createMoviesWatchContinuity,
  type MoviesWatchContinuity,
  type MoviesWatchTarget,
} from "../moviesWatchContinuity";

const fullscreenDescriptors = {
  documentExitFullscreen: Object.getOwnPropertyDescriptor(document, "exitFullscreen"),
  documentFullscreenElement: Object.getOwnPropertyDescriptor(document, "fullscreenElement"),
  documentExitPictureInPicture: Object.getOwnPropertyDescriptor(document, "exitPictureInPicture"),
  documentPictureInPictureElement: Object.getOwnPropertyDescriptor(
    document,
    "pictureInPictureElement",
  ),
  documentPictureInPictureEnabled: Object.getOwnPropertyDescriptor(
    document,
    "pictureInPictureEnabled",
  ),
  navigatorStandalone: Object.getOwnPropertyDescriptor(navigator, "standalone"),
  documentWebkitExitFullscreen: Object.getOwnPropertyDescriptor(document, "webkitExitFullscreen"),
  documentWebkitFullscreenElement: Object.getOwnPropertyDescriptor(
    document,
    "webkitFullscreenElement",
  ),
  elementRequestFullscreen: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "requestFullscreen",
  ),
  elementWebkitRequestFullscreen: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "webkitRequestFullscreen",
  ),
  videoWebkitDisplayingFullscreen: Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "webkitDisplayingFullscreen",
  ),
  videoWebkitEnterFullscreen: Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "webkitEnterFullscreen",
  ),
  videoWebkitExitFullscreen: Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "webkitExitFullscreen",
  ),
  videoWebkitPresentationMode: Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "webkitPresentationMode",
  ),
  videoWebkitSetPresentationMode: Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "webkitSetPresentationMode",
  ),
  videoWebkitSupportsPresentationMode: Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "webkitSupportsPresentationMode",
  ),
  videoDisablePictureInPicture: Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "disablePictureInPicture",
  ),
  videoDefaultPlaybackRate: Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    "defaultPlaybackRate",
  ),
  videoRequestPictureInPicture: Object.getOwnPropertyDescriptor(
    HTMLVideoElement.prototype,
    "requestPictureInPicture",
  ),
};

const hlsMock = vi.hoisted(() => {
  type HlsHandler = (event: string, data: Record<string, unknown>) => void;

  const instances: MockHls[] = [];

  class MockHls {
    static Events = {
      ERROR: "hlsError",
      LEVEL_SWITCHED: "hlsLevelSwitched",
      MANIFEST_PARSED: "hlsManifestParsed",
    };
    static isSupported = vi.fn(() => true);

    attachMedia = vi.fn();
    config: unknown;
    currentLevel = -1;
    destroy = vi.fn();
    handlers = new Map<string, HlsHandler>();
    loadSource = vi.fn();
    nextLevel = -1;
    on = vi.fn((event: string, handler: HlsHandler) => {
      this.handlers.set(event, handler);
    });

    constructor(config?: unknown) {
      this.config = config;
      instances.push(this);
    }

    emitFatalError(): void {
      this.handlers.get(MockHls.Events.ERROR)?.(MockHls.Events.ERROR, { fatal: true });
    }

    emitLevelSwitched(level: number): void {
      this.currentLevel = level;
      this.handlers.get(MockHls.Events.LEVEL_SWITCHED)?.(MockHls.Events.LEVEL_SWITCHED, {
        level,
      });
    }

    emitManifestParsed(
      levels: readonly { bitrate: number; height: number }[] = [
        { bitrate: 2_500_000, height: 720 },
        { bitrate: 5_000_000, height: 1080 },
      ],
    ): void {
      this.handlers.get(MockHls.Events.MANIFEST_PARSED)?.(MockHls.Events.MANIFEST_PARSED, {
        levels,
      });
    }
  }

  return { MockHls, instances };
});

vi.mock("hls.js", () => ({
  default: hlsMock.MockHls,
}));

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

const MOVIE_TARGET: MoviesWatchTarget = {
  kind: "movie",
  slug: "fight-club",
  tmdbId: 550,
};
const mountedContinuities: MoviesWatchContinuity[] = [];

function persistPlayerProgress(
  target: MoviesWatchTarget,
  entry: {
    readonly currentTime: number;
    readonly duration: number;
    readonly source?: MoviePlaySource;
    readonly sourceIndex?: number;
  } = {
    currentTime: 42,
    duration: 120,
  },
): void {
  const continuity = createMoviesWatchContinuity();
  continuity.saveProgress(target, entry);
  continuity.dispose();
}

function readPlayerProgress(target: MoviesWatchTarget = MOVIE_TARGET) {
  const continuity = createMoviesWatchContinuity();
  const progress = continuity.progressFor(target);
  continuity.dispose();
  return progress;
}

async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
  await nextTick();
}

function click(element: Element, options: { detail?: number } = {}): void {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      button: 0,
      cancelable: true,
      detail: options.detail ?? 0,
    }),
  );
}

function doubleClick(element: Element): void {
  element.dispatchEvent(
    new MouseEvent("dblclick", {
      bubbles: true,
      button: 0,
      cancelable: true,
      detail: 2,
    }),
  );
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, property);
    return;
  }

  Object.defineProperty(target, property, descriptor);
}

function restoreFullscreenProperties(): void {
  restoreProperty(document, "exitFullscreen", fullscreenDescriptors.documentExitFullscreen);
  restoreProperty(document, "fullscreenElement", fullscreenDescriptors.documentFullscreenElement);
  restoreProperty(
    document,
    "exitPictureInPicture",
    fullscreenDescriptors.documentExitPictureInPicture,
  );
  restoreProperty(
    document,
    "pictureInPictureElement",
    fullscreenDescriptors.documentPictureInPictureElement,
  );
  restoreProperty(
    document,
    "pictureInPictureEnabled",
    fullscreenDescriptors.documentPictureInPictureEnabled,
  );
  restoreProperty(navigator, "standalone", fullscreenDescriptors.navigatorStandalone);
  restoreProperty(
    document,
    "webkitExitFullscreen",
    fullscreenDescriptors.documentWebkitExitFullscreen,
  );
  restoreProperty(
    document,
    "webkitFullscreenElement",
    fullscreenDescriptors.documentWebkitFullscreenElement,
  );
  restoreProperty(
    HTMLElement.prototype,
    "requestFullscreen",
    fullscreenDescriptors.elementRequestFullscreen,
  );
  restoreProperty(
    HTMLElement.prototype,
    "webkitRequestFullscreen",
    fullscreenDescriptors.elementWebkitRequestFullscreen,
  );
  restoreProperty(
    HTMLVideoElement.prototype,
    "webkitDisplayingFullscreen",
    fullscreenDescriptors.videoWebkitDisplayingFullscreen,
  );
  restoreProperty(
    HTMLVideoElement.prototype,
    "webkitEnterFullscreen",
    fullscreenDescriptors.videoWebkitEnterFullscreen,
  );
  restoreProperty(
    HTMLVideoElement.prototype,
    "webkitExitFullscreen",
    fullscreenDescriptors.videoWebkitExitFullscreen,
  );
  restoreProperty(
    HTMLVideoElement.prototype,
    "webkitPresentationMode",
    fullscreenDescriptors.videoWebkitPresentationMode,
  );
  restoreProperty(
    HTMLVideoElement.prototype,
    "webkitSetPresentationMode",
    fullscreenDescriptors.videoWebkitSetPresentationMode,
  );
  restoreProperty(
    HTMLVideoElement.prototype,
    "webkitSupportsPresentationMode",
    fullscreenDescriptors.videoWebkitSupportsPresentationMode,
  );
  restoreProperty(
    HTMLVideoElement.prototype,
    "disablePictureInPicture",
    fullscreenDescriptors.videoDisablePictureInPicture,
  );
  restoreProperty(
    HTMLMediaElement.prototype,
    "defaultPlaybackRate",
    fullscreenDescriptors.videoDefaultPlaybackRate,
  );
  restoreProperty(
    HTMLVideoElement.prototype,
    "requestPictureInPicture",
    fullscreenDescriptors.videoRequestPictureInPicture,
  );
}

function setMediaSupport(options: { nativeHls: boolean; hlsJs: boolean }): void {
  Object.defineProperty(HTMLMediaElement.prototype, "canPlayType", {
    configurable: true,
    value: vi.fn((type: string) =>
      options.nativeHls &&
      (type === "application/vnd.apple.mpegurl" || type === "application/x-mpegURL")
        ? "probably"
        : "",
    ),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn(function play(this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    }),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(function pause(this: HTMLMediaElement) {
      this.dispatchEvent(new Event("pause"));
    }),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    configurable: true,
    value: 1,
    writable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "muted", {
    configurable: true,
    value: false,
    writable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
    configurable: true,
    value: 1,
    writable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "defaultPlaybackRate", {
    configurable: true,
    value: 1,
    writable: true,
  });
  hlsMock.MockHls.isSupported.mockReturnValue(options.hlsJs);
}

function mountPlayer(props: Partial<InstanceType<typeof MovieHlsPlayer>["$props"]> = {}) {
  const watchContinuity = props.watchContinuity ?? createMoviesWatchContinuity();
  mountedContinuities.push(watchContinuity);
  return mount(MovieHlsPlayer, {
    attachTo: document.body,
    props: {
      play: playInfo(),
      posterUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      target: MOVIE_TARGET,
      title: "Fight Club",
      watchContinuity,
      ...props,
    },
  });
}

function setMediaMetrics(
  video: HTMLVideoElement,
  options: { bufferedEnd?: number; currentTime?: number; duration?: number } = {},
): void {
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: options.duration ?? 120,
  });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    value: options.currentTime ?? 0,
    writable: true,
  });
  Object.defineProperty(video, "buffered", {
    configurable: true,
    value: {
      end: vi.fn(() => options.bufferedEnd ?? 0),
      length: options.bufferedEnd === undefined ? 0 : 1,
      start: vi.fn(() => 0),
    },
  });
  video.dispatchEvent(new Event("loadedmetadata"));
  video.dispatchEvent(new Event("timeupdate"));
  video.dispatchEvent(new Event("progress"));
}

function setVideoDimensions(
  video: HTMLVideoElement,
  options: { height: number; width: number },
): void {
  Object.defineProperty(video, "videoWidth", {
    configurable: true,
    value: options.width,
  });
  Object.defineProperty(video, "videoHeight", {
    configurable: true,
    value: options.height,
  });
}

function setProgressRect(element: Element, options: { left?: number; width?: number } = {}): void {
  const left = options.left ?? 0;
  const width = options.width ?? 216;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        bottom: 36,
        height: 36,
        left,
        right: left + width,
        top: 0,
        width,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

function pointerEvent(type: string, element: Element, options: { clientX: number }): void {
  element.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: options.clientX,
    }),
  );
}

function sliderInputs(wrapper: VaporTestWrapper) {
  return wrapper.findAll<HTMLInputElement>('input[type="range"]');
}

async function commitSlider(slider: ReturnType<typeof sliderInputs>[number], value: number) {
  slider.element.value = String(value);
  await slider.trigger("change");
}

async function openSettings(wrapper: VaporTestWrapper): Promise<void> {
  click(wrapper.get('button[aria-label="Playback settings"]').element);
  await settle();
}

function menuRadioItem(label: string): Element {
  const item = Array.from(document.body.querySelectorAll('[role="menuitemradio"]')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (item === undefined) {
    throw new Error(`Menu item not found: ${label}`);
  }
  return item;
}

function bottomVolumeButton(wrapper: VaporTestWrapper, label: "Mute" | "Unmute") {
  return wrapper.get(`.movies-hls-player__volume-control button[aria-label="${label}"]`);
}

function topbarVolumeButton(wrapper: VaporTestWrapper, label: "Mute" | "Unmute") {
  return wrapper.get(`.movies-hls-player__top-actions button[aria-label="${label}"]`);
}

describe("MovieHlsPlayer", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    hlsMock.instances.length = 0;
    hlsMock.MockHls.isSupported.mockReset();
    setMediaSupport({ hlsJs: true, nativeHls: false });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    for (const continuity of mountedContinuities.splice(0)) {
      continuity.dispose();
    }
    document.body.innerHTML = "";
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    restoreFullscreenProperties();
  });

  it("uses native HLS when the browser can play m3u8", async () => {
    setMediaSupport({ hlsJs: false, nativeHls: true });

    const wrapper = mountPlayer();
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    expect(video.src).toBe("https://stream.example.test/fight-club/master.m3u8");
    expect(video.hasAttribute("controls")).toBe(false);
    expect(hlsMock.instances).toHaveLength(0);
  });

  it("attaches hls.js when native HLS is unavailable", async () => {
    const wrapper = mountPlayer();
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    expect(hlsMock.instances).toHaveLength(1);
    expect(hlsMock.instances[0]!.config).toMatchObject({
      pLoader: expect.any(Function),
    });
    expect(hlsMock.instances[0]!.loadSource).toHaveBeenCalledWith(
      "https://stream.example.test/fight-club/master.m3u8",
    );
    expect(hlsMock.instances[0]!.attachMedia).toHaveBeenCalledWith(video);
  });

  it("uses the ghost variant for player chrome icon buttons", async () => {
    const wrapper = mountPlayer({
      nextEpisodeLabel: "Next episode: Episode 2 - The Edit",
      showBackButton: true,
    });
    await settle();

    const buttons = wrapper.element.querySelectorAll(".movies-hls-player__button");
    expect(buttons.length).toBeGreaterThan(0);

    for (const button of buttons) {
      expect(button.classList).toContain("rp-button--ghost");
      expect(button.classList).not.toContain("rp-button--surface");
    }
  });

  it("sizes the player stage from the loaded video dimensions", async () => {
    const wrapper = mountPlayer();
    await settle();

    const stage = wrapper.get(".movies-hls-player__stage").element as HTMLElement;
    const video = wrapper.get("video").element as HTMLVideoElement;
    setVideoDimensions(video, { height: 1920, width: 1080 });
    video.dispatchEvent(new Event("loadedmetadata"));
    await settle();

    expect(stage.style.getPropertyValue("--movies-player-stage-aspect-ratio")).toBe("1080 / 1920");
    expect(stage.style.getPropertyValue("--movies-player-stage-aspect-ratio-value")).toBe("0.5625");
  });

  it("renders HLS ad markers on the seek track", async () => {
    const wrapper = mountPlayer();
    await settle();

    const markerPlaylist = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10,
content-a.ts
#EXT-X-DISCONTINUITY
#EXTINF:5,
convertv8/overlay.ts
#EXT-X-DISCONTINUITY
#EXTINF:10,
content-b.ts
#EXT-X-DISCONTINUITY
#EXTINF:10,
/v8/18d007379882ef14b73445b93bf6168d/segment_0001.ts
#EXTINF:10,
/v8/18d007379882ef14b73445b93bf6168d/segment_0002.ts
#EXT-X-DISCONTINUITY
#EXTINF:10,
content-c.ts
`;

    type FakePlaylistCallbacks = {
      readonly onSuccess: (
        response: { readonly data: string; readonly url: string },
        stats: object,
        context: unknown,
        networkDetails: unknown,
      ) => void;
    };

    class FakePlaylistLoader {
      context: unknown = null;
      stats = {};
      abort(): void {}
      destroy(): void {}
      load(context: unknown, _config: unknown, callbacks: FakePlaylistCallbacks): void {
        this.context = context;
        callbacks.onSuccess(
          {
            data: markerPlaylist,
            url: "https://stream.example.test/level.m3u8",
          },
          this.stats,
          context,
          null,
        );
      }
    }

    const config = hlsMock.instances[0]!.config as {
      pLoader: new (config: unknown) => {
        load: (context: unknown, config: unknown, callbacks: FakePlaylistCallbacks) => void;
      };
    };
    const loader = new config.pLoader({ loader: FakePlaylistLoader });
    loader.load(
      {
        deliveryDirectives: null,
        id: null,
        level: 0,
        levelOrTrack: null,
        responseType: "text",
        type: "level",
        url: "https://stream.example.test/level.m3u8",
      },
      {},
      {
        onAbort: vi.fn(),
        onError: vi.fn(),
        onSuccess: vi.fn(),
        onTimeout: vi.fn(),
      },
    );

    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 0, duration: 35 });
    await settle();

    expect(wrapper.find(".movies-hls-player__ad-markers").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player__controls").attributes("style")).toContain(
      "--movies-player-ad-markers: linear-gradient",
    );
  });

  it("prefers hls.js when both native HLS and MediaSource are reported", async () => {
    setMediaSupport({ hlsJs: true, nativeHls: true });

    const wrapper = mountPlayer();
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    expect(video.src).toBe("");
    expect(hlsMock.instances).toHaveLength(1);
    expect(hlsMock.instances[0]!.loadSource).toHaveBeenCalledWith(
      "https://stream.example.test/fight-club/master.m3u8",
    );
    expect(hlsMock.instances[0]!.attachMedia).toHaveBeenCalledWith(video);
  });

  it("seeks to saved progress after metadata loads", async () => {
    persistPlayerProgress(MOVIE_TARGET);

    const wrapper = mountPlayer();
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 0, duration: 120 });
    await settle();

    expect(video.currentTime).toBe(42);
    expect(wrapper.get(".movies-hls-player__time").text()).toBe("0:42");
  });

  it("saves playback progress from time updates", async () => {
    const wrapper = mountPlayer();
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 30, duration: 120 });
    await settle();

    expect(readPlayerProgress()).toMatchObject({
      currentTime: 30,
      duration: 120,
    });
  });

  it("saves the active source snapshot with playback progress", async () => {
    const alternateSource = {
      embedUrl: "https://player.example.test/player/?url=fight-club-alt",
      filename: "fight-club-alt.m3u8",
      m3u8Url: "https://stream.example.test/fight-club/alt.m3u8",
      name: "Alt",
      serverName: "Server 2",
      slug: "alt",
    };
    const sources = [playInfo().sources[0]!, alternateSource];
    const wrapper = mountPlayer({
      play: playInfo({ sources }),
      sourceIndex: 1,
    });
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 30, duration: 120 });
    await settle();

    const continuity = createMoviesWatchContinuity();
    expect(continuity.restoreSource(MOVIE_TARGET, sources)).toBe(1);
    continuity.dispose();
  });

  it("saves progress immediately after seek and pause", async () => {
    const wrapper = mountPlayer();
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 15, duration: 120 });
    await settle();

    await commitSlider(sliderInputs(wrapper)[0]!, 45);
    await settle();

    expect(readPlayerProgress()).toMatchObject({
      currentTime: 45,
      duration: 120,
    });

    video.currentTime = 61;
    video.dispatchEvent(new Event("pause"));
    await settle();

    expect(readPlayerProgress()).toMatchObject({
      currentTime: 61,
      duration: 120,
    });
  });

  it("clears saved progress when playback ends", async () => {
    persistPlayerProgress(MOVIE_TARGET, {
      currentTime: 30,
      duration: 120,
    });

    const wrapper = mountPlayer();
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 30, duration: 120 });
    await settle();

    video.currentTime = 120;
    video.dispatchEvent(new Event("ended"));
    await settle();

    expect(readPlayerProgress()).toBeNull();
  });

  it("does not persist non-resumable playback progress", async () => {
    const wrapper = mountPlayer();
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 2, duration: 120 });
    await settle();

    expect(readPlayerProgress()).toBeNull();
  });

  it("destroys the previous hls.js instance when switching sources", async () => {
    const wrapper = mountPlayer({
      play: playInfo({
        sources: [
          playInfo().sources[0]!,
          {
            embedUrl: "https://player.example.test/player/?url=fight-club-alt",
            filename: "fight-club-alt.m3u8",
            m3u8Url: "https://stream.example.test/fight-club/alt.m3u8",
            name: "Alt",
            serverName: "Server 2",
            slug: "alt",
          },
        ],
      }),
    });
    await settle();

    const firstInstance = hlsMock.instances[0]!;
    await wrapper.setProps({ sourceIndex: 1 });
    await settle();

    expect(firstInstance.destroy).toHaveBeenCalledTimes(1);
    expect(hlsMock.instances).toHaveLength(2);
    expect(hlsMock.instances[1]!.loadSource).toHaveBeenCalledWith(
      "https://stream.example.test/fight-club/alt.m3u8",
    );
  });

  it("restores a switched source after a same-target play refresh and immediate teardown", async () => {
    const sources = [
      playInfo().sources[0]!,
      {
        embedUrl: "https://player.example.test/player/?url=fight-club-alt",
        filename: "fight-club-alt.m3u8",
        m3u8Url: "https://stream.example.test/fight-club/alt.m3u8",
        name: "Alt",
        serverName: "Server 2",
        slug: "alt",
      },
    ];
    const refreshedSources = sources.map((source) => ({ ...source }));
    const firstContinuity = createMoviesWatchContinuity();
    const wrapper = mountPlayer({
      play: playInfo({ sources }),
      watchContinuity: firstContinuity,
    });
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 30, duration: 120 });
    await settle();

    firstContinuity.selectSource(MOVIE_TARGET, sources, 1);
    await wrapper.setProps({
      play: playInfo({ sources: refreshedSources }),
      sourceIndex: 1,
    });
    await settle();
    wrapper.unmount();
    firstContinuity.dispose();

    const nextContinuity = createMoviesWatchContinuity();
    const restoredSourceIndex = nextContinuity.restoreSource(MOVIE_TARGET, refreshedSources);
    mountPlayer({
      play: playInfo({ sources: refreshedSources }),
      sourceIndex: restoredSourceIndex,
      watchContinuity: nextContinuity,
    });
    await settle();

    expect(restoredSourceIndex).toBe(1);
    expect(hlsMock.instances.at(-1)!.loadSource).toHaveBeenCalledWith(
      "https://stream.example.test/fight-club/alt.m3u8",
    );
  });

  it("persists the outgoing target before attaching a new target", async () => {
    const nextTarget: MoviesWatchTarget = {
      kind: "movie",
      slug: "the-matrix",
      tmdbId: 603,
    };
    const watchContinuity = createMoviesWatchContinuity();
    watchContinuity.saveProgress(nextTarget, { currentTime: 60, duration: 120 });
    const wrapper = mountPlayer({ watchContinuity });
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 30, duration: 120 });
    await settle();

    await wrapper.setProps({
      play: playInfo({ slug: "the-matrix" }),
      target: nextTarget,
      title: "The Matrix",
    });
    await settle();

    expect(watchContinuity.progressFor(MOVIE_TARGET)?.currentTime).toBe(30);
    expect(watchContinuity.progressFor(nextTarget)?.currentTime).toBe(60);
  });

  it("shows an error when HLS is unsupported", async () => {
    setMediaSupport({ hlsJs: false, nativeHls: false });

    const wrapper = mountPlayer();
    await settle();

    expect(wrapper.text()).toContain("This browser cannot play this stream.");
  });

  it("shows an error for fatal hls.js failures", async () => {
    const wrapper = mountPlayer();
    await settle();

    hlsMock.instances[0]!.emitFatalError();
    await settle();

    expect(wrapper.text()).toContain("Could not play this stream.");
    expect(hlsMock.instances[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys hls.js on unmount", async () => {
    const wrapper = mountPlayer();
    await settle();

    const instance = hlsMock.instances[0]!;
    wrapper.unmount();

    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("uses only the center play button and toggles playback from the player surface", async () => {
    vi.useFakeTimers();
    const wrapper = mountPlayer();
    await settle();

    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const video = wrapper.get("video").element;

    expect(wrapper.find('.movies-hls-player__control-row button[aria-label="Play"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.find('.movies-hls-player__control-row button[aria-label="Pause"]').exists(),
    ).toBe(false);
    expect(wrapper.find('.movies-hls-player__center-play[aria-label="Play"]').exists()).toBe(true);

    click(video);
    vi.advanceTimersByTime(220);
    await settle();

    expect(play).toHaveBeenCalledTimes(1);
    expect(
      wrapper.find('.movies-hls-player__control-row button[aria-label="Pause"]').exists(),
    ).toBe(false);

    click(video);
    vi.advanceTimersByTime(220);
    await settle();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.movies-hls-player__control-row button[aria-label="Play"]').exists()).toBe(
      false,
    );
  });

  it("commits seek changes from the custom seek slider", async () => {
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 15, duration: 120, bufferedEnd: 64 });
    await settle();

    await commitSlider(sliderInputs(wrapper)[0]!, 45);
    await settle();

    expect(video.currentTime).toBe(45);
    expect(
      wrapper.get(".movies-hls-player__control-row .movies-hls-player__progress").exists(),
    ).toBe(true);
    expect(wrapper.get(".movies-hls-player__seek-input").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player__seek-range").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player__seek").classes()).toContain(
      "rp-slider--thumb-interaction",
    );
    expect(
      wrapper.get(".rp-slider__track-underlay > .movies-hls-player__seek-loaded").exists(),
    ).toBe(true);
    expect(wrapper.get(".rp-slider__bar.movies-hls-player__seek-range").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player__controls").attributes("style")).toContain(
      "--movies-player-loaded: 0.5333333333333333",
    );
    expect(wrapper.get(".movies-hls-player__time").text()).toBe("0:45");
    expect(wrapper.get(".movies-hls-player__duration").text()).toBe("2:00");
  });

  it("seeks from the full progress hit area", async () => {
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 15, duration: 120, bufferedEnd: 64 });
    await settle();

    const progress = wrapper.get(".movies-hls-player__progress").element;
    setProgressRect(progress);

    pointerEvent("pointermove", progress, { clientX: 108 });
    await settle();

    expect(wrapper.get(".movies-hls-player__seek-preview").text()).toBe("1:00");
    expect(wrapper.get(".movies-hls-player__progress").classes()).toContain(
      "movies-hls-player__progress--previewing",
    );

    pointerEvent("pointerdown", progress, { clientX: 108 });
    pointerEvent("pointerup", progress, { clientX: 108 });
    await settle();

    expect(video.currentTime).toBe(60);
    expect(wrapper.get(".movies-hls-player__time").text()).toBe("1:00");
    expect(wrapper.get(".movies-hls-player__progress").classes()).not.toContain(
      "movies-hls-player__progress--previewing",
    );
  });

  it("updates volume and mute state from custom controls", async () => {
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;
    const volumeSlider = sliderInputs(wrapper)[1]!;

    expect(wrapper.find(".movies-hls-player__volume-control").exists()).toBe(true);
    expect(wrapper.find(".movies-hls-player__volume-popover").exists()).toBe(true);
    expect(wrapper.find(".movies-hls-player__top-volume-button").exists()).toBe(true);
    expect(volumeSlider.attributes("aria-orientation")).toBe("vertical");

    await volumeSlider.setValue(35);
    await settle();

    expect(video.volume).toBe(0.35);

    click(bottomVolumeButton(wrapper, "Mute").element);
    await settle();
    expect(video.muted).toBe(true);

    click(bottomVolumeButton(wrapper, "Unmute").element);
    await settle();
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(0.35);
  });

  it("toggles mute from the mobile topbar action", async () => {
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;

    expect(wrapper.find(".movies-hls-player__top-actions").exists()).toBe(true);
    expect(
      wrapper.find(".movies-hls-player__top-actions .movies-hls-player__volume-popover").exists(),
    ).toBe(false);

    click(topbarVolumeButton(wrapper, "Mute").element);
    await settle();

    expect(video.muted).toBe(true);

    click(topbarVolumeButton(wrapper, "Unmute").element);
    await settle();

    expect(video.muted).toBe(false);
  });

  it("handles playback, volume, mute, and fallback fullscreen keyboard shortcuts", async () => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "webkitRequestFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen", {
      configurable: true,
      value: undefined,
    });

    const wrapper = mountPlayer();
    await settle();
    const stage = wrapper.get(".movies-hls-player__stage");
    const video = wrapper.get("video").element as HTMLVideoElement;

    await stage.trigger("keydown", { key: "k" });
    await settle();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);

    await stage.trigger("keydown", { key: "ArrowDown" });
    await settle();
    expect(video.volume).toBe(0.9);

    await stage.trigger("keydown", { key: "m" });
    await settle();
    expect(video.muted).toBe(true);

    await stage.trigger("keydown", { key: "f" });
    await settle();
    expect(stage.classes()).toContain("movies-hls-player__stage--fullscreen");

    await stage.trigger("keydown", { key: "Escape" });
    await settle();
    expect(stage.classes()).not.toContain("movies-hls-player__stage--fullscreen");
  });

  it("toggles picture-in-picture from the control row when supported", async () => {
    let pictureInPictureElement: Element | null = null;
    let playerVideo: HTMLVideoElement | null = null;
    const requestPictureInPicture = vi.fn(() => {
      pictureInPictureElement = playerVideo;
      playerVideo?.dispatchEvent(new Event("enterpictureinpicture"));
      return Promise.resolve({});
    });
    const exitPictureInPicture = vi.fn(() => {
      const activeElement = pictureInPictureElement;
      pictureInPictureElement = null;
      activeElement?.dispatchEvent(new Event("leavepictureinpicture"));
      return Promise.resolve();
    });

    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      get: () => pictureInPictureElement,
    });
    Object.defineProperty(document, "exitPictureInPicture", {
      configurable: true,
      value: exitPictureInPicture,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "requestPictureInPicture", {
      configurable: true,
      value: requestPictureInPicture,
    });

    const wrapper = mountPlayer();
    await settle();
    playerVideo = wrapper.get("video").element as HTMLVideoElement;

    expect(bottomVolumeButton(wrapper, "Mute").exists()).toBe(true);
    expect(
      wrapper
        .find('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]')
        .exists(),
    ).toBe(true);
    expect(wrapper.find(".movies-hls-player__topline").exists()).toBe(true);

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Enter picture-in-picture"]')
        .element,
    );
    await settle();

    expect(requestPictureInPicture).toHaveBeenCalledTimes(1);
    expect(pictureInPictureElement).toBe(playerVideo);
    expect(
      wrapper
        .find('.movies-hls-player__control-row button[aria-label="Exit picture-in-picture"]')
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]')
        .exists(),
    ).toBe(false);
    expect(wrapper.find(".movies-hls-player__topline").exists()).toBe(false);

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Exit picture-in-picture"]')
        .element,
    );
    await settle();

    expect(exitPictureInPicture).toHaveBeenCalledTimes(1);
    expect(pictureInPictureElement).toBeNull();
    expect(
      wrapper
        .find('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]')
        .exists(),
    ).toBe(true);
    expect(wrapper.find(".movies-hls-player__topline").exists()).toBe(true);
  });

  it("toggles iOS WebKit picture-in-picture from the control row", async () => {
    let presentationMode = "inline";
    const setPresentationMode = vi.fn(function setPresentationMode(
      this: HTMLVideoElement,
      mode: string,
    ) {
      presentationMode = mode;
      this.dispatchEvent(new Event("webkitpresentationmodechanged"));
    });
    const supportsPresentationMode = vi.fn((mode: string) => mode === "picture-in-picture");

    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "webkitPresentationMode", {
      configurable: true,
      get: () => presentationMode,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "webkitSetPresentationMode", {
      configurable: true,
      value: setPresentationMode,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "webkitSupportsPresentationMode", {
      configurable: true,
      value: supportsPresentationMode,
    });

    const wrapper = mountPlayer();
    await settle();

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Enter picture-in-picture"]')
        .element,
    );
    await settle();

    expect(supportsPresentationMode).toHaveBeenCalledWith("picture-in-picture");
    expect(setPresentationMode).toHaveBeenCalledWith("picture-in-picture");
    expect(
      wrapper
        .find('.movies-hls-player__control-row button[aria-label="Exit picture-in-picture"]')
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]')
        .exists(),
    ).toBe(false);

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Exit picture-in-picture"]')
        .element,
    );
    await settle();

    expect(setPresentationMode).toHaveBeenLastCalledWith("inline");
    expect(
      wrapper
        .find('.movies-hls-player__control-row button[aria-label="Enter picture-in-picture"]')
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]')
        .exists(),
    ).toBe(true);
  });

  it("hides picture-in-picture in iOS standalone mode even when the API reports support", async () => {
    const requestPictureInPicture = vi.fn(() => Promise.resolve({}));

    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "requestPictureInPicture", {
      configurable: true,
      value: requestPictureInPicture,
    });

    const wrapper = mountPlayer();
    await settle();

    expect(wrapper.find(".movies-hls-player__pip-button").exists()).toBe(false);
    expect(requestPictureInPicture).not.toHaveBeenCalled();
  });

  it("renders an optional top-left back button before the title line", async () => {
    const wrapper = mountPlayer({ showBackButton: true });
    await settle();

    const backButton = wrapper.get('.movies-hls-player__back-action button[aria-label="Back"]');

    expect(wrapper.get(".movies-hls-player__topbar").classes()).toContain(
      "movies-hls-player__topbar--with-back",
    );
    click(backButton.element);
    await settle();

    expect(wrapper.emitted("back")).toHaveLength(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("emits next-episode from the optional next episode control", async () => {
    const wrapper = mountPlayer({ nextEpisodeLabel: "Next episode: Episode 2 - The Edit" });
    await settle();
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);

    click(wrapper.get('button[aria-label="Next episode: Episode 2 - The Edit"]').element);
    await settle();

    expect(wrapper.emitted("next-episode")).toHaveLength(1);
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it("shows HLS quality options after manifest parsing and applies manual quality", async () => {
    const wrapper = mountPlayer();
    await settle();

    const instance = hlsMock.instances[0]!;
    instance.emitManifestParsed();
    await settle();

    await openSettings(wrapper);
    expect(document.body.textContent).toContain("Auto");
    expect(document.body.textContent).toContain("720p");
    expect(document.body.textContent).toContain("1080p");

    click(menuRadioItem("720p"));
    await settle();

    expect(instance.currentLevel).toBe(0);
  });

  it("applies playback speed from the settings menu", async () => {
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;

    await openSettings(wrapper);
    expect(document.body.textContent).toContain("Speed");
    expect(document.body.textContent).toContain("1.5x");

    click(menuRadioItem("1.5x"));
    await settle();

    expect(video.playbackRate).toBe(1.5);
    expect(wrapper.emitted("update:playbackSpeed")).toEqual([[1.5]]);
    expect(wrapper.get(".movies-hls-player__source-status").text()).toContain("1.5x");
  });

  it("applies playback speed changes from the parent prop", async () => {
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;

    await wrapper.setProps({ playbackSpeed: 1.25 });
    await settle();

    expect(video.playbackRate).toBe(1.25);
    expect(wrapper.get(".movies-hls-player__source-status").text()).toContain("1.25x");
  });

  it("keeps playback active when playback speed changes from the settings menu", async () => {
    vi.useFakeTimers();
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);

    click(video);
    vi.advanceTimersByTime(220);
    await settle();

    expect(play).toHaveBeenCalledTimes(1);

    await openSettings(wrapper);
    click(menuRadioItem("1.25x"));
    vi.advanceTimersByTime(220);
    await settle();

    expect(video.playbackRate).toBe(1.25);
    expect(pause).not.toHaveBeenCalled();
    expect(wrapper.get(".movies-hls-player__source-status").text()).toContain("1.25x");
  });

  it("keeps the selected playback speed when switching sources", async () => {
    const wrapper = mountPlayer({
      play: playInfo({
        sources: [
          playInfo().sources[0]!,
          {
            embedUrl: "https://player.example.test/player/?url=fight-club-alt",
            filename: "fight-club-alt.m3u8",
            m3u8Url: "https://stream.example.test/fight-club/alt.m3u8",
            name: "Alt",
            serverName: "Server 2",
            slug: "alt",
          },
        ],
      }),
    });
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;

    await openSettings(wrapper);
    click(menuRadioItem("1.5x"));
    await settle();

    expect(video.playbackRate).toBe(1.5);

    await wrapper.setProps({ sourceIndex: 1 });
    await settle();

    expect(video.playbackRate).toBe(1.5);
    expect(hlsMock.instances[1]!.loadSource).toHaveBeenCalledWith(
      "https://stream.example.test/fight-club/alt.m3u8",
    );
  });

  it("reapplies playback speed if the media element resets after loading a new source", async () => {
    const wrapper = mountPlayer({
      play: playInfo({
        sources: [
          playInfo().sources[0]!,
          {
            embedUrl: "https://player.example.test/player/?url=fight-club-alt",
            filename: "fight-club-alt.m3u8",
            m3u8Url: "https://stream.example.test/fight-club/alt.m3u8",
            name: "Alt",
            serverName: "Server 2",
            slug: "alt",
          },
        ],
      }),
    });
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;

    await openSettings(wrapper);
    click(menuRadioItem("1.5x"));
    await settle();

    await wrapper.setProps({ sourceIndex: 1 });
    await settle();
    video.playbackRate = 1;
    video.defaultPlaybackRate = 1;

    video.dispatchEvent(new Event("loadedmetadata"));
    await settle();

    expect(video.defaultPlaybackRate).toBe(1.5);
    expect(video.playbackRate).toBe(1.5);
    expect(wrapper.get(".movies-hls-player__source-status").text()).toContain("1.5x");
  });

  it("keeps the settings menu inside the fullscreen player stage", async () => {
    let fullscreenElement: Element | null = null;
    let playerShell: Element | null = null;
    const requestFullscreen = vi.fn(() => {
      fullscreenElement = playerShell;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    const wrapper = mountPlayer();
    await settle();
    playerShell = wrapper.get(".movies-hls-player__stage").element;

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]').element,
    );
    await settle();

    await openSettings(wrapper);

    const stage = wrapper.get(".movies-hls-player__stage").element;
    const menu = stage.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(stage.contains(menu)).toBe(true);
  });

  it("auto-hides controls while playback is active", async () => {
    vi.useFakeTimers();
    const wrapper = mountPlayer();
    await settle();

    click(wrapper.get("video").element);
    vi.advanceTimersByTime(220);
    await flushPromises();

    expect(wrapper.get(".movies-hls-player__controls").classes()).not.toContain(
      "movies-hls-player__controls--hidden",
    );

    vi.advanceTimersByTime(3200);
    await settle();

    expect(wrapper.get(".movies-hls-player__controls").classes()).toContain(
      "movies-hls-player__controls--hidden",
    );
  });

  it("keeps hidden controls hidden when seeking with arrow keys during playback", async () => {
    vi.useFakeTimers();
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 30, duration: 120 });
    await settle();

    click(video);
    vi.advanceTimersByTime(220);
    await flushPromises();
    vi.advanceTimersByTime(3200);
    await settle();

    expect(wrapper.get(".movies-hls-player__controls").classes()).toContain(
      "movies-hls-player__controls--hidden",
    );

    await wrapper.get(".movies-hls-player__stage").trigger("keydown", { key: "ArrowRight" });
    await settle();

    expect(video.currentTime).toBe(40);
    expect(wrapper.get(".movies-hls-player__controls").classes()).toContain(
      "movies-hls-player__controls--hidden",
    );
  });

  it("keeps hidden controls hidden when keyboard seeking causes buffering", async () => {
    vi.useFakeTimers();
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 30, duration: 120 });
    await settle();

    click(video);
    vi.advanceTimersByTime(220);
    await flushPromises();
    vi.advanceTimersByTime(3200);
    await settle();

    expect(wrapper.get(".movies-hls-player__controls").classes()).toContain(
      "movies-hls-player__controls--hidden",
    );

    await wrapper.get(".movies-hls-player__stage").trigger("keydown", { key: "ArrowRight" });
    video.dispatchEvent(new Event("waiting"));
    await settle();

    expect(video.currentTime).toBe(40);
    expect(wrapper.get(".movies-hls-player__spinner").exists()).toBe(true);
    expect(wrapper.get(".movies-hls-player__controls").classes()).toContain(
      "movies-hls-player__controls--hidden",
    );
  });

  it("keeps hidden controls hidden when keyboard seeking starts from the seek control", async () => {
    vi.useFakeTimers();
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 30, duration: 120 });
    await settle();

    click(video);
    vi.advanceTimersByTime(220);
    await flushPromises();
    vi.advanceTimersByTime(3200);
    await settle();

    expect(wrapper.get(".movies-hls-player__controls").classes()).toContain(
      "movies-hls-player__controls--hidden",
    );

    await wrapper.get(".movies-hls-player__seek").trigger("keydown", { key: "ArrowRight" });
    await settle();

    expect(video.currentTime).toBe(40);
    expect(wrapper.get(".movies-hls-player__controls").classes()).toContain(
      "movies-hls-player__controls--hidden",
    );
  });

  it("requests fullscreen on the player shell through the control row fullscreen button", async () => {
    let fullscreenElement: Element | null = null;
    let playerShell: Element | null = null;
    const requestFullscreen = vi.fn(() => {
      fullscreenElement = playerShell;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });
    const exitFullscreen = vi.fn(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    const wrapper = mountPlayer();
    await settle();
    playerShell = wrapper.get(".movies-hls-player__stage").element;

    expect(
      wrapper
        .find('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]')
        .exists(),
    ).toBe(true);

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]').element,
    );
    await settle();

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(fullscreenElement).toBe(wrapper.get(".movies-hls-player__stage").element);
    expect(
      wrapper.find('.movies-hls-player__control-row button[aria-label="Exit fullscreen"]').exists(),
    ).toBe(true);

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Exit fullscreen"]').element,
    );
    await settle();

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(fullscreenElement).toBeNull();
  });

  it("enters fullscreen from a double click on the player surface without toggling playback", async () => {
    let fullscreenElement: Element | null = null;
    let playerShell: Element | null = null;
    const requestFullscreen = vi.fn(() => {
      fullscreenElement = playerShell;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    const wrapper = mountPlayer();
    await settle();
    playerShell = wrapper.get(".movies-hls-player__stage").element;

    const video = wrapper.get("video").element;
    click(video, { detail: 1 });
    click(video, { detail: 2 });
    doubleClick(video);
    await settle();

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(fullscreenElement).toBe(wrapper.get(".movies-hls-player__stage").element);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("falls back to native iOS video fullscreen when shell fullscreen is unavailable", async () => {
    let displayingFullscreen = false;
    const enterFullscreen = vi.fn(function enterFullscreen(this: HTMLVideoElement) {
      displayingFullscreen = true;
      this.dispatchEvent(new Event("webkitbeginfullscreen"));
    });

    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "webkitDisplayingFullscreen", {
      configurable: true,
      get: () => displayingFullscreen,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen", {
      configurable: true,
      value: enterFullscreen,
    });

    const wrapper = mountPlayer();
    await settle();

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]').element,
    );
    await settle();

    expect(enterFullscreen).toHaveBeenCalledTimes(1);
    expect(
      wrapper.find('.movies-hls-player__control-row button[aria-label="Exit fullscreen"]').exists(),
    ).toBe(true);
  });

  it("uses CSS fullscreen when no native fullscreen API is available", async () => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "webkitRequestFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen", {
      configurable: true,
      value: undefined,
    });

    const wrapper = mountPlayer();
    await settle();

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Enter fullscreen"]').element,
    );
    await settle();

    expect(wrapper.get(".movies-hls-player__stage").classes()).toContain(
      "movies-hls-player__stage--fullscreen",
    );
    expect(
      wrapper.find('.movies-hls-player__control-row button[aria-label="Exit fullscreen"]').exists(),
    ).toBe(true);

    click(
      wrapper.get('.movies-hls-player__control-row button[aria-label="Exit fullscreen"]').element,
    );
    await settle();

    expect(wrapper.get(".movies-hls-player__stage").classes()).not.toContain(
      "movies-hls-player__stage--fullscreen",
    );
  });
});
