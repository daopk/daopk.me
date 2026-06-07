// @vitest-environment happy-dom

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import MovieHlsPlayer from "./MovieHlsPlayer.vue";
import type { MoviePlayInfo } from "../moviesApi";

const fullscreenDescriptors = {
  documentExitFullscreen: Object.getOwnPropertyDescriptor(document, "exitFullscreen"),
  documentFullscreenElement: Object.getOwnPropertyDescriptor(document, "fullscreenElement"),
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
    currentLevel = -1;
    destroy = vi.fn();
    handlers = new Map<string, HlsHandler>();
    loadSource = vi.fn();
    nextLevel = -1;
    on = vi.fn((event: string, handler: HlsHandler) => {
      this.handlers.set(event, handler);
    });

    constructor() {
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

async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
  await nextTick();
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
  hlsMock.MockHls.isSupported.mockReturnValue(options.hlsJs);
}

function mountPlayer(props: Partial<InstanceType<typeof MovieHlsPlayer>["$props"]> = {}) {
  return mount(MovieHlsPlayer, {
    attachTo: document.body,
    props: {
      play: playInfo(),
      posterUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      title: "Fight Club",
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

function sliderRoots(wrapper: VueWrapper) {
  return wrapper.findAllComponents({ name: "SliderRoot" });
}

async function openSettings(wrapper: VueWrapper): Promise<void> {
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

describe("MovieHlsPlayer", () => {
  beforeEach(() => {
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
    document.body.innerHTML = "";
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
    expect(hlsMock.instances[0]!.loadSource).toHaveBeenCalledWith(
      "https://stream.example.test/fight-club/master.m3u8",
    );
    expect(hlsMock.instances[0]!.attachMedia).toHaveBeenCalledWith(video);
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
    await openSettings(wrapper);
    click(menuRadioItem("Server 2 - Alt"));
    await settle();

    expect(firstInstance.destroy).toHaveBeenCalledTimes(1);
    expect(hlsMock.instances).toHaveLength(2);
    expect(hlsMock.instances[1]!.loadSource).toHaveBeenCalledWith(
      "https://stream.example.test/fight-club/alt.m3u8",
    );
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

  it("plays and pauses through custom controls", async () => {
    const wrapper = mountPlayer();
    await settle();

    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);

    click(wrapper.get('.movies-hls-player__control-row button[aria-label="Play"]').element);
    await settle();

    expect(play).toHaveBeenCalledTimes(1);
    expect(
      wrapper.find('.movies-hls-player__control-row button[aria-label="Pause"]').exists(),
    ).toBe(true);

    click(wrapper.get('.movies-hls-player__control-row button[aria-label="Pause"]').element);
    await settle();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.movies-hls-player__control-row button[aria-label="Play"]').exists()).toBe(
      true,
    );
  });

  it("commits seek changes from the custom seek slider", async () => {
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;
    setMediaMetrics(video, { currentTime: 15, duration: 120, bufferedEnd: 64 });
    await settle();

    sliderRoots(wrapper)[0]!.vm.$emit("valueCommit", [45]);
    await settle();

    expect(video.currentTime).toBe(45);
    expect(wrapper.text()).toContain("0:45 / 2:00");
  });

  it("updates volume and mute state from custom controls", async () => {
    const wrapper = mountPlayer();
    await settle();
    const video = wrapper.get("video").element as HTMLVideoElement;

    sliderRoots(wrapper)[1]!.vm.$emit("update:modelValue", [35]);
    await settle();

    expect(video.volume).toBe(0.35);

    click(wrapper.get('.movies-hls-player__control-row button[aria-label="Mute"]').element);
    await settle();
    expect(video.muted).toBe(true);

    click(wrapper.get('.movies-hls-player__control-row button[aria-label="Unmute"]').element);
    await settle();
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(0.35);
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

  it("auto-hides controls while playback is active", async () => {
    vi.useFakeTimers();
    const wrapper = mountPlayer();
    await settle();

    click(wrapper.get('.movies-hls-player__control-row button[aria-label="Play"]').element);
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

  it("requests fullscreen on the player shell through custom controls", async () => {
    let fullscreenElement: Element | null = null;
    const requestFullscreen = vi.fn(function requestFullscreen(this: HTMLElement) {
      fullscreenElement = this;
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
