import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import {
  AppChromeInjectionKey,
  AppContextInjectionKey,
  KernelInjectionKey,
  type AppChromeContentSize,
  type AppChromeController,
  type AppContext,
  type Kernel,
} from "@daopk/sdk";

import App from "./App.vue";
import { AUTO_HIDE_CONTROLS_DELAY_MS } from "./composables/useAutoHideControls";
import type {
  YouTubePlayerEvent,
  YouTubePlayerOptions,
  YouTubePlayerStateChangeEvent,
} from "./youtubeIframeApi";

const youtubeApi = vi.hoisted(() => {
  const states = {
    unstarted: -1,
    ended: 0,
    playing: 1,
    paused: 2,
    buffering: 3,
    cued: 5,
  } as const;

  class MockPlayer {
    readonly element: HTMLElement;
    readonly options: YouTubePlayerOptions;
    currentTime = 0;
    duration = 120;
    loadedFraction = 0.5;
    title = "YouTube Developers Live: Embedded Web Player Customization";
    volume = 80;
    muted = false;
    readonly destroy = vi.fn();
    readonly getCurrentTime = vi.fn(() => this.currentTime);
    readonly getDuration = vi.fn(() => this.duration);
    readonly getVideoData = vi.fn(() => ({ title: this.title, video_id: "IQsLEaj89bg" }));
    readonly getVideoLoadedFraction = vi.fn(() => this.loadedFraction);
    readonly getVolume = vi.fn(() => this.volume);
    readonly isMuted = vi.fn(() => this.muted);
    readonly mute = vi.fn(() => {
      this.muted = true;
    });
    readonly pauseVideo = vi.fn(() => {
      this.options.events?.onStateChange?.({
        target: this,
        data: states.paused,
      } as YouTubePlayerStateChangeEvent);
    });
    readonly playVideo = vi.fn(() => {
      this.options.events?.onStateChange?.({
        target: this,
        data: states.playing,
      } as YouTubePlayerStateChangeEvent);
    });
    readonly seekTo = vi.fn((seconds: number) => {
      this.currentTime = seconds;
    });
    readonly setVolume = vi.fn((next: number) => {
      this.volume = next;
    });
    readonly unMute = vi.fn(() => {
      this.muted = false;
    });

    constructor(element: HTMLElement, options: YouTubePlayerOptions) {
      this.element = element;
      this.options = options;
      createdPlayers.push(this);
    }
  }

  const createdPlayers: MockPlayer[] = [];
  const loadYouTubeIframeApi = vi.fn();

  return {
    MockPlayer,
    createdPlayers,
    loadYouTubeIframeApi,
    states,
  };
});

vi.mock("./youtubeIframeApi", () => ({
  loadYouTubeIframeApi: youtubeApi.loadYouTubeIframeApi,
  YOUTUBE_PLAYER_STATES: youtubeApi.states,
}));

function makeContext(args: Readonly<Record<string, unknown>> = {}): AppContext {
  return Object.freeze({
    manifestId: "youtube-player",
    handleId: "youtube-player-handle",
    args: Object.freeze(args),
  });
}

function mountYoutubePlayer(
  context: AppContext = makeContext(),
  options: {
    readonly appChrome?: AppChromeController;
    readonly kernel?: Pick<Kernel, "events">;
  } = {},
) {
  const provide: Record<symbol, unknown> = {
    [AppContextInjectionKey as symbol]: context,
  };
  if (options.appChrome !== undefined) {
    provide[AppChromeInjectionKey as symbol] = options.appChrome;
  }
  if (options.kernel !== undefined) {
    provide[KernelInjectionKey as symbol] = options.kernel;
  }

  return mount(App, {
    global: {
      provide,
    },
  });
}

async function waitForPlayer(): Promise<InstanceType<typeof youtubeApi.MockPlayer>> {
  await vi.waitFor(() => {
    expect(youtubeApi.createdPlayers).toHaveLength(1);
  });

  return youtubeApi.createdPlayers[0]!;
}

async function mountReadyPlayer(
  args: Readonly<Record<string, unknown>> = { videoId: "IQsLEaj89bg" },
  options: {
    readonly appChrome?: AppChromeController;
    readonly kernel?: Pick<Kernel, "events">;
  } = {},
) {
  const wrapper = mountYoutubePlayer(makeContext(args), options);
  const player = await waitForPlayer();
  player.options.events?.onReady?.({ target: player } as YouTubePlayerEvent);
  await nextTick();

  return { player, wrapper };
}

function makeKernelEvents(): Pick<Kernel, "events"> {
  const listeners = new Map<
    string,
    Set<(payload: KernelEventPayloads[keyof KernelEventPayloads]) => void>
  >();

  return {
    events: {
      emit(channel, payload) {
        for (const listener of listeners.get(channel) ?? []) {
          listener(payload);
        }
      },
      on(channel, listener) {
        const bucket = listeners.get(channel) ?? new Set();
        bucket.add(listener as (payload: KernelEventPayloads[keyof KernelEventPayloads]) => void);
        listeners.set(channel, bucket);

        return (): void => {
          bucket.delete(
            listener as (payload: KernelEventPayloads[keyof KernelEventPayloads]) => void,
          );
        };
      },
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    } as unknown as Kernel["events"],
  };
}

function seekSlider(wrapper: ReturnType<typeof mountYoutubePlayer>) {
  return wrapper.findComponent(".youtube-player__seek");
}

function volumeSlider(wrapper: ReturnType<typeof mountYoutubePlayer>) {
  return wrapper.findComponent(".youtube-player__volume");
}

function mockOEmbedResponse(payload: Record<string, unknown>): void {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: vi.fn(async () => payload),
  } as unknown as Response);
}

beforeEach(() => {
  youtubeApi.createdPlayers.length = 0;
  youtubeApi.loadYouTubeIframeApi.mockReset();
  youtubeApi.loadYouTubeIframeApi.mockResolvedValue({ Player: youtubeApi.MockPlayer });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      json: vi.fn(async () => ({})),
    })),
  );

  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );

  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("YouTube Player App", () => {
  it.each([
    ["missing args", {}],
    ["invalid video id", { videoId: "not-a-video-id" }],
    ["non-YouTube URL", { url: "https://example.com/watch?v=IQsLEaj89bg" }],
    ["malformed URL", { url: "youtube.com/watch?v=IQsLEaj89bg" }],
  ])("renders only the blank player surface for %s", async (_label, args) => {
    const wrapper = mountYoutubePlayer(makeContext(args));
    await flushPromises();

    expect(youtubeApi.loadYouTubeIframeApi).not.toHaveBeenCalled();
    expect(wrapper.find(".youtube-player__controls").exists()).toBe(false);
    expect(wrapper.text()).toBe("");

    wrapper.unmount();
  });

  it("constructs YT.Player from launch args.videoId", async () => {
    const wrapper = mountYoutubePlayer(makeContext({ videoId: "IQsLEaj89bg" }));
    const player = await waitForPlayer();

    expect(youtubeApi.loadYouTubeIframeApi).toHaveBeenCalledTimes(1);
    expect(player.options.videoId).toBe("IQsLEaj89bg");
    expect(player.options.height).toBe("100%");
    expect(player.options.width).toBe("100%");
    expect(player.options.playerVars).toEqual({
      controls: 0,
      origin: window.location.origin,
      playsinline: 1,
    });

    wrapper.unmount();
  });

  it("mirrors the loaded video title into app chrome", async () => {
    const appChrome: AppChromeController = {
      setTitle: vi.fn(),
      setBackAction: vi.fn(),
    };
    const wrapper = mountYoutubePlayer(makeContext({ videoId: "IQsLEaj89bg" }), { appChrome });
    const player = await waitForPlayer();

    expect(appChrome.setTitle).toHaveBeenCalledWith("YouTube Player");

    player.options.events?.onReady?.({ target: player } as YouTubePlayerEvent);
    await nextTick();

    expect(appChrome.setTitle).toHaveBeenLastCalledWith(
      "YouTube Developers Live: Embedded Web Player Customization",
    );

    wrapper.unmount();
  });

  it.each([
    ["watch URL", "https://www.youtube.com/watch?v=IQsLEaj89bg"],
    ["short URL", "https://youtu.be/IQsLEaj89bg"],
    ["embed URL", "https://www.youtube.com/embed/IQsLEaj89bg"],
    ["shorts URL", "https://www.youtube.com/shorts/IQsLEaj89bg"],
    ["live URL", "https://www.youtube.com/live/IQsLEaj89bg"],
    ["mobile URL", "https://m.youtube.com/watch?v=IQsLEaj89bg"],
  ])("constructs YT.Player from a %s", async (_label, url) => {
    const wrapper = mountYoutubePlayer(makeContext({ url }));
    const player = await waitForPlayer();

    expect(player.options.videoId).toBe("IQsLEaj89bg");

    wrapper.unmount();
  });

  it("prioritizes args.videoId over args.url", async () => {
    const wrapper = mountYoutubePlayer(
      makeContext({
        videoId: "abcdefghijk",
        url: "https://www.youtube.com/watch?v=IQsLEaj89bg",
      }),
    );
    const player = await waitForPlayer();

    expect(player.options.videoId).toBe("abcdefghijk");

    wrapper.unmount();
  });

  it("switches videos when the running player receives a matching deeplink resume event", async () => {
    const kernel = makeKernelEvents();
    const { player, wrapper } = await mountReadyPlayer({ videoId: "IQsLEaj89bg" }, { kernel });

    kernel.events.emit("youtube-player.open.requested", {
      handleId: "other-handle",
      source: "deeplink",
      videoId: "dQw4w9WgXcQ",
    });
    await nextTick();

    expect(youtubeApi.createdPlayers).toHaveLength(1);

    kernel.events.emit("youtube-player.open.requested", {
      handleId: "youtube-player-handle",
      source: "deeplink",
      videoId: "dQw4w9WgXcQ",
    });

    await vi.waitFor(() => {
      expect(youtubeApi.createdPlayers).toHaveLength(2);
    });

    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(youtubeApi.createdPlayers[1]?.options.videoId).toBe("dQw4w9WgXcQ");

    wrapper.unmount();
  });

  it("does not reload the running video for a repeated same-video resume event", async () => {
    const kernel = makeKernelEvents();
    const { player, wrapper } = await mountReadyPlayer({ videoId: "fY6h5FBTZM8" }, { kernel });

    kernel.events.emit("youtube-player.open.requested", {
      handleId: "youtube-player-handle",
      source: "deeplink",
      videoId: "fY6h5FBTZM8",
    });
    await nextTick();

    expect(youtubeApi.createdPlayers).toHaveLength(1);
    expect(player.destroy).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("switches videos when the resume event carries a YouTube URL", async () => {
    const kernel = makeKernelEvents();
    const { player, wrapper } = await mountReadyPlayer({ videoId: "IQsLEaj89bg" }, { kernel });

    kernel.events.emit("youtube-player.open.requested", {
      handleId: "youtube-player-handle",
      source: "deeplink",
      url: "https://www.youtube.com/watch?v=u8vJjTH9Igg",
    });

    await vi.waitFor(() => {
      expect(youtubeApi.createdPlayers).toHaveLength(2);
    });

    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(youtubeApi.createdPlayers[1]?.options.videoId).toBe("u8vJjTH9Igg");

    wrapper.unmount();
  });

  it("runs play and pause through the player API", async () => {
    const { player, wrapper } = await mountReadyPlayer();

    await wrapper.find('button[aria-label="Play"]').trigger("click");
    expect(player.playVideo).toHaveBeenCalledTimes(1);

    await wrapper.find('button[aria-label="Pause"]').trigger("click");
    expect(player.pauseVideo).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("shows a custom thumbnail overlay while the video is not playing", async () => {
    const { player, wrapper } = await mountReadyPlayer();

    expect(wrapper.get(".youtube-player__poster").attributes("aria-label")).toBe(
      "Play YouTube Developers Live: Embedded Web Player Customization",
    );
    expect(wrapper.get(".youtube-player__poster-image").attributes("src")).toBe(
      "https://img.youtube.com/vi/IQsLEaj89bg/maxresdefault.jpg",
    );

    await wrapper.get(".youtube-player__poster-image").trigger("error");
    await nextTick();

    expect(wrapper.get(".youtube-player__poster-image").attributes("src")).toBe(
      "https://img.youtube.com/vi/IQsLEaj89bg/sddefault.jpg",
    );

    await wrapper.get(".youtube-player__poster").trigger("click");
    await nextTick();

    expect(player.playVideo).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".youtube-player__poster").exists()).toBe(false);

    await wrapper.find('button[aria-label="Pause"]').trigger("click");
    await nextTick();

    expect(wrapper.find(".youtube-player__poster").exists()).toBe(true);

    wrapper.unmount();
  });

  it("updates the player stage ratio from the loaded thumbnail", async () => {
    const { wrapper } = await mountReadyPlayer();
    const image = wrapper.get(".youtube-player__poster-image").element as HTMLImageElement;

    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 1080,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 1920,
    });

    await wrapper.get(".youtube-player__poster-image").trigger("load");
    await nextTick();

    expect(wrapper.get(".youtube-player__stage").attributes("style")).toContain(
      "--youtube-player-aspect-ratio: 0.5625",
    );

    wrapper.unmount();
  });

  it("requests a content-size update when the loaded thumbnail changes the player ratio", async () => {
    const contentSizes: Array<AppChromeContentSize | null> = [];
    const appChrome: AppChromeController = {
      setTitle: vi.fn(),
      setBackAction: vi.fn(),
      setContentSize: (size) => contentSizes.push(size),
    };
    const { wrapper } = await mountReadyPlayer({ videoId: "IQsLEaj89bg" }, { appChrome });
    const image = wrapper.get(".youtube-player__poster-image").element as HTMLImageElement;

    expect(contentSizes).toEqual([]);

    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 3,
    });

    await wrapper.get(".youtube-player__poster-image").trigger("load");
    await nextTick();

    expect(contentSizes.at(-1)).toEqual({ width: 720, height: 540 });

    wrapper.unmount();
  });

  it("uses YouTube oEmbed metadata for the video ratio and keeps that over poster dimensions", async () => {
    mockOEmbedResponse({ width: 200, height: 150, thumbnail_width: 1280, thumbnail_height: 720 });
    const contentSizes: Array<AppChromeContentSize | null> = [];
    const appChrome: AppChromeController = {
      setTitle: vi.fn(),
      setBackAction: vi.fn(),
      setContentSize: (size) => contentSizes.push(size),
    };
    const { wrapper } = await mountReadyPlayer({ videoId: "fY6h5FBTZM8" }, { appChrome });
    const image = wrapper.get(".youtube-player__poster-image").element as HTMLImageElement;

    await vi.waitFor(() => {
      expect(contentSizes).toContainEqual({ width: 720, height: 540 });
    });
    expect(wrapper.get(".youtube-player__stage").attributes("style")).toContain(
      "--youtube-player-aspect-ratio: 1.3333333333333333",
    );

    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 720,
    });

    await wrapper.get(".youtube-player__poster-image").trigger("load");
    await nextTick();

    expect(wrapper.get(".youtube-player__stage").attributes("style")).toContain(
      "--youtube-player-aspect-ratio: 1.3333333333333333",
    );
    expect(contentSizes.at(-1)).toEqual({ width: 720, height: 540 });

    wrapper.unmount();
  });

  it("hides the poster overlay once playback starts", async () => {
    const { wrapper } = await mountReadyPlayer();

    expect(wrapper.find(".youtube-player__poster").exists()).toBe(true);

    await wrapper.find('button[aria-label="Play"]').trigger("click");
    await nextTick();

    expect(wrapper.find(".youtube-player__poster").exists()).toBe(false);

    wrapper.unmount();
  });

  it("auto-hides controls while playing and reveals them on interaction", async () => {
    vi.useFakeTimers();
    const { wrapper } = await mountReadyPlayer();

    await wrapper.find('button[aria-label="Play"]').trigger("click");
    await nextTick();

    expect(wrapper.get(".youtube-player__controls").classes()).not.toContain(
      "youtube-player__controls--hidden",
    );

    await vi.advanceTimersByTimeAsync(AUTO_HIDE_CONTROLS_DELAY_MS + 1);
    await nextTick();

    expect(wrapper.get(".youtube-player__controls").classes()).toContain(
      "youtube-player__controls--hidden",
    );
    expect(wrapper.find(".youtube-player__interaction-layer").exists()).toBe(true);

    await wrapper.get(".youtube-player__interaction-layer").trigger("pointermove");
    await nextTick();

    expect(wrapper.get(".youtube-player__controls").classes()).not.toContain(
      "youtube-player__controls--hidden",
    );

    wrapper.unmount();
  });

  it("keeps controls visible while paused", async () => {
    vi.useFakeTimers();
    const { wrapper } = await mountReadyPlayer();

    await wrapper.find('button[aria-label="Play"]').trigger("click");
    await nextTick();
    await wrapper.find('button[aria-label="Pause"]').trigger("click");
    await nextTick();

    await vi.advanceTimersByTimeAsync(AUTO_HIDE_CONTROLS_DELAY_MS + 1);
    await nextTick();

    expect(wrapper.get(".youtube-player__controls").classes()).not.toContain(
      "youtube-player__controls--hidden",
    );

    wrapper.unmount();
  });

  it("seeks only on slider commit", async () => {
    const { player, wrapper } = await mountReadyPlayer();

    seekSlider(wrapper).vm.$emit("update:modelValue", 42);
    expect(player.seekTo).not.toHaveBeenCalled();

    seekSlider(wrapper).vm.$emit("commit", 42);
    expect(player.seekTo).toHaveBeenCalledWith(42, true);

    wrapper.unmount();
  });

  it("sets volume and maps zero to mute", async () => {
    const { player, wrapper } = await mountReadyPlayer();

    volumeSlider(wrapper).vm.$emit("update:modelValue", 0);
    expect(player.setVolume).toHaveBeenCalledWith(0);
    expect(player.mute).toHaveBeenCalledTimes(1);

    volumeSlider(wrapper).vm.$emit("update:modelValue", 35);
    expect(player.setVolume).toHaveBeenCalledWith(35);
    expect(player.unMute).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("toggles mute through the player API", async () => {
    const { player, wrapper } = await mountReadyPlayer();

    await wrapper.find('button[aria-label="Mute"]').trigger("click");
    expect(player.mute).toHaveBeenCalledTimes(1);

    await wrapper.find('button[aria-label="Unmute"]').trigger("click");
    expect(player.unMute).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("requests fullscreen on the player container", async () => {
    const { wrapper } = await mountReadyPlayer();

    await wrapper.find('button[aria-label="Enter fullscreen"]').trigger("click");

    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("shows YouTube player errors and autoplay-blocked notices", async () => {
    const { player, wrapper } = await mountReadyPlayer();

    player.options.events?.onError?.({ target: player, data: 101 });
    await nextTick();
    expect(wrapper.text()).toContain("This video could not be played (101).");

    player.options.events?.onAutoplayBlocked?.({ target: player });
    await nextTick();
    expect(wrapper.text()).toContain("Playback was blocked.");

    wrapper.unmount();
  });

  it("shows an API load failure while keeping the control surface disabled", async () => {
    youtubeApi.loadYouTubeIframeApi.mockRejectedValueOnce(new Error("offline"));
    const wrapper = mountYoutubePlayer(makeContext({ videoId: "IQsLEaj89bg" }));

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("YouTube player is unavailable.");
    });

    expect(wrapper.find(".youtube-player__controls").exists()).toBe(true);

    wrapper.unmount();
  });

  it("polls player state and destroys the player on unmount", async () => {
    vi.useFakeTimers();
    const { player, wrapper } = await mountReadyPlayer();

    player.currentTime = 64;
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();

    expect(wrapper.text()).toContain("1:04");
    expect(vi.getTimerCount()).toBe(1);

    wrapper.unmount();

    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
