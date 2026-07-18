import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
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
import YouTubePlayerSurface from "./components/YouTubePlayerSurface.vue";
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
  return wrapper.get<HTMLInputElement>('.youtube-player__seek input[type="range"]');
}

function progressBar(wrapper: ReturnType<typeof mountYoutubePlayer>) {
  return wrapper.get(".youtube-player__progress");
}

function stubElementRect(
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
): void {
  const domRect = {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    left: rect.left,
    toJSON: () => ({}),
  } as DOMRect;

  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => domRect,
  });
}

function expectPlayerIframe(
  wrapper: ReturnType<typeof mountYoutubePlayer>,
  player: InstanceType<typeof youtubeApi.MockPlayer>,
  videoId: string,
): URL {
  const frame = wrapper.get("iframe");

  expect(player.element).toBe(frame.element);
  expect(frame.attributes("credentialless")).toBe("credentialless");
  expect(frame.attributes("allow")?.replace(/\s+/g, " ").replace(/;\s*$/, "").trim()).toBe(
    "autoplay; encrypted-media; picture-in-picture",
  );
  expect(frame.element.hasAttribute("allowfullscreen")).toBe(true);
  expect(frame.attributes("referrerpolicy")).toBe("strict-origin-when-cross-origin");
  expect(frame.attributes("title")).toBe("YouTube video player");

  const src = frame.attributes("src");
  expect(src).toBeDefined();

  const url = new URL(src!);
  expect(url.origin).toBe("https://www.youtube.com");
  expect(url.pathname).toBe(`/embed/${videoId}`);
  expect(url.searchParams.get("controls")).toBe("0");
  expect(url.searchParams.get("disablekb")).toBe("0");
  expect(url.searchParams.get("enablejsapi")).toBe("1");
  expect(url.searchParams.get("fs")).toBe("1");
  expect(url.searchParams.get("iv_load_policy")).toBe("3");
  expect(url.searchParams.get("origin")).toBe(window.location.origin);
  expect(url.searchParams.get("playsinline")).toBe("1");
  expect(url.searchParams.get("rel")).toBe("0");

  return url;
}

function expectPlayerVideoId(
  player: InstanceType<typeof youtubeApi.MockPlayer> | undefined,
  videoId: string,
): void {
  if (player === undefined) {
    throw new Error("Expected a YouTube player to be constructed.");
  }

  expect(player.element).toBeInstanceOf(HTMLIFrameElement);
  expect(new URL((player.element as HTMLIFrameElement).src).pathname).toBe(`/embed/${videoId}`);
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
  ])("renders a manual video form for %s", async (_label, args) => {
    const wrapper = mountYoutubePlayer(makeContext(args));
    await flushPromises();

    expect(youtubeApi.loadYouTubeIframeApi).not.toHaveBeenCalled();
    expect(wrapper.find(".youtube-player__controls").exists()).toBe(false);
    expect(wrapper.get('form[aria-label="Open YouTube video"]').exists()).toBe(true);
    const input = wrapper.get("#youtube-player-video-input");
    expect(input.attributes("placeholder")).toBe("YouTube URL or video ID");
    expect(input.attributes("aria-label")).toBe("YouTube URL or video ID");
    expect(wrapper.get(".youtube-player__open-input-root").classes()).toContain(
      "rp-input--size-lg",
    );
    const submit = wrapper.get<HTMLButtonElement>(".youtube-player__open-button");
    expect(submit.element.type).toBe("submit");
    expect(submit.text()).toContain("Play");
    expect(submit.classes()).toContain("rp-button--ghost");
    expect(submit.classes()).toContain("rp-button--size-md");
    expect(wrapper.get(".youtube-player__open-input-root .rp-input__right").element).toContain(
      submit.element,
    );
    const submitIcon = submit.get(".rp-button__left svg");
    expect(submitIcon.attributes("width")).toBe("1em");
    expect(submitIcon.attributes("height")).toBe("1em");

    wrapper.unmount();
  });

  it("opens and autoplays a manually entered video id", async () => {
    const wrapper = mountYoutubePlayer(makeContext());

    await wrapper.get("#youtube-player-video-input").setValue("dQw4w9WgXcQ");
    await wrapper.get('form[aria-label="Open YouTube video"]').trigger("submit");
    const player = await waitForPlayer();

    expectPlayerIframe(wrapper, player, "dQw4w9WgXcQ");
    expect(wrapper.find('form[aria-label="Open YouTube video"]').exists()).toBe(false);

    player.options.events?.onReady?.({ target: player } as YouTubePlayerEvent);
    await nextTick();

    expect(player.playVideo).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("opens a manually entered YouTube URL", async () => {
    const wrapper = mountYoutubePlayer(makeContext());

    await wrapper
      .get("#youtube-player-video-input")
      .setValue("https://www.youtube.com/watch?v=IQsLEaj89bg");
    await wrapper.get('form[aria-label="Open YouTube video"]').trigger("submit");
    const player = await waitForPlayer();

    expectPlayerIframe(wrapper, player, "IQsLEaj89bg");

    wrapper.unmount();
  });

  it("keeps the manual video form open for invalid input", async () => {
    const wrapper = mountYoutubePlayer(makeContext());

    await wrapper
      .get("#youtube-player-video-input")
      .setValue("https://example.com/watch?v=IQsLEaj89bg");
    await wrapper.get('form[aria-label="Open YouTube video"]').trigger("submit");
    await nextTick();

    expect(youtubeApi.loadYouTubeIframeApi).not.toHaveBeenCalled();
    expect(wrapper.get(".youtube-player__input-error").text()).toBe(
      "Enter a valid YouTube URL or video ID.",
    );

    await wrapper.get("#youtube-player-video-input").setValue("IQsLEaj89bg");
    await nextTick();

    expect(wrapper.find(".youtube-player__input-error").exists()).toBe(false);

    wrapper.unmount();
  });

  it("constructs YT.Player from a credentialless iframe for launch args.videoId", async () => {
    const wrapper = mountYoutubePlayer(makeContext({ videoId: "IQsLEaj89bg" }));
    const player = await waitForPlayer();

    expect(youtubeApi.loadYouTubeIframeApi).toHaveBeenCalledTimes(1);
    expect(player.options.videoId).toBeUndefined();
    expect(player.options.height).toBeUndefined();
    expect(player.options.width).toBeUndefined();
    expect(player.options.playerVars).toBeUndefined();
    expectPlayerIframe(wrapper, player, "IQsLEaj89bg");

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

    expectPlayerIframe(wrapper, player, "IQsLEaj89bg");

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

    expectPlayerIframe(wrapper, player, "abcdefghijk");

    wrapper.unmount();
  });

  it("autoplays when launch args request it", async () => {
    const { player, wrapper } = await mountReadyPlayer({
      videoId: "IQsLEaj89bg",
      autoplay: true,
    });

    expect(player.playVideo).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(wrapper.find(".youtube-player__poster").exists()).toBe(false));

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
    expectPlayerVideoId(youtubeApi.createdPlayers[1], "dQw4w9WgXcQ");

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

  it("plays the current video when a same-video resume event requests autoplay", async () => {
    const kernel = makeKernelEvents();
    const { player, wrapper } = await mountReadyPlayer({ videoId: "fY6h5FBTZM8" }, { kernel });

    kernel.events.emit("youtube-player.open.requested", {
      handleId: "youtube-player-handle",
      source: "deeplink",
      videoId: "fY6h5FBTZM8",
      autoplay: true,
    });
    await nextTick();

    expect(youtubeApi.createdPlayers).toHaveLength(1);
    expect(player.destroy).not.toHaveBeenCalled();
    expect(player.playVideo).toHaveBeenCalledTimes(1);

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
    expectPlayerVideoId(youtubeApi.createdPlayers[1], "u8vJjTH9Igg");

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
    expect(wrapper.get(".youtube-player__poster-image").classes()).not.toContain(
      "youtube-player__poster-image--loaded",
    );

    await wrapper.get(".youtube-player__poster-image").trigger("error");
    await nextTick();

    expect(wrapper.get(".youtube-player__poster-image").attributes("src")).toBe(
      "https://img.youtube.com/vi/IQsLEaj89bg/sddefault.jpg",
    );
    expect(wrapper.get(".youtube-player__poster-image").classes()).not.toContain(
      "youtube-player__poster-image--loaded",
    );

    await wrapper.get(".youtube-player__poster-image").trigger("load");
    await nextTick();

    expect(wrapper.get(".youtube-player__poster-image").classes()).toContain(
      "youtube-player__poster-image--loaded",
    );

    await wrapper.get(".youtube-player__poster").trigger("click");
    await nextTick();

    expect(player.playVideo).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(wrapper.find(".youtube-player__poster").exists()).toBe(false));

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

  it("emits aspect ratio changes from loaded video metadata", async () => {
    mockOEmbedResponse({ width: 1080, height: 1920 });
    const wrapper = mount(YouTubePlayerSurface, {
      props: {
        videoId: "IQsLEaj89bg",
      },
    });

    await vi.waitFor(() => {
      expect(wrapper.emitted("aspect-ratio-change")).toContainEqual([0.5625]);
    });
    expect(wrapper.get(".youtube-player__stage").attributes("style")).toContain(
      "--youtube-player-aspect-ratio: 0.5625",
    );

    wrapper.unmount();
  });

  it("overscans cover-fit stages to crop embedded preview bars", async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 500,
      height: 500,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const wrapper = mount(YouTubePlayerSurface, {
      props: {
        controlsEnabled: false,
        fit: "cover",
        overscan: "auto",
        videoId: "IQsLEaj89bg",
      },
    });

    await vi.waitFor(() => {
      const style = wrapper.get(".youtube-player__stage").attributes("style");
      expect(style).toContain("inline-size: 1140px");
      expect(style).toContain("block-size: 641.25px");
    });

    wrapper.unmount();
    rectSpy.mockRestore();
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

    await vi.waitFor(() => expect(wrapper.find(".youtube-player__poster").exists()).toBe(false));

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

  it("makes disabled-control preview iframes noninteractive", async () => {
    const wrapper = mount(YouTubePlayerSurface, {
      props: {
        autoplayRevision: 1,
        controlsEnabled: false,
        privacyEnhanced: true,
        videoId: "IQsLEaj89bg",
      },
    });
    const player = await waitForPlayer();
    player.options.events?.onReady?.({ target: player } as YouTubePlayerEvent);
    await nextTick();

    const frame = wrapper.get("iframe");
    expect(frame.classes()).toContain("youtube-player__embed--noninteractive");
    expect(frame.attributes("allowfullscreen")).toBeUndefined();
    expect(frame.attributes("aria-hidden")).toBe("true");
    expect(frame.attributes("tabindex")).toBe("-1");
    expect(wrapper.find(".youtube-player__poster").exists()).toBe(false);
    expect(wrapper.find(".youtube-player__controls").exists()).toBe(false);
    expect(wrapper.find(".youtube-player__preview-shield").exists()).toBe(true);
    expect(player.playVideo).toHaveBeenCalledTimes(1);

    player.options.events?.onAutoplayBlocked?.({ target: player });
    await nextTick();
    expect(wrapper.text()).toContain("Playback was blocked.");
    expect(wrapper.text()).not.toContain("Press play to start.");

    const url = new URL(frame.attributes("src")!);
    expect(url.origin).toBe("https://www.youtube-nocookie.com");
    expect(url.searchParams.get("controls")).toBe("0");
    expect(url.searchParams.get("disablekb")).toBe("1");
    expect(url.searchParams.get("fs")).toBe("0");
    expect(url.searchParams.get("iv_load_policy")).toBe("3");
    expect(url.searchParams.get("rel")).toBe("0");

    wrapper.unmount();
  });

  it("mutes requested autoplay before starting playback", async () => {
    const wrapper = mount(YouTubePlayerSurface, {
      props: {
        autoplayRevision: 1,
        controlsEnabled: false,
        muted: true,
        privacyEnhanced: true,
        videoId: "IQsLEaj89bg",
      },
    });
    const player = await waitForPlayer();
    player.options.events?.onReady?.({ target: player } as YouTubePlayerEvent);
    await nextTick();

    expect(player.mute).toHaveBeenCalled();
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    expect(player.mute.mock.invocationCallOrder[0]!).toBeLessThan(
      player.playVideo.mock.invocationCallOrder[0]!,
    );

    const url = new URL(wrapper.get("iframe").attributes("src")!);
    expect(url.searchParams.get("mute")).toBe("1");

    wrapper.unmount();
  });

  it("emits playback lifecycle events from player state changes", async () => {
    const wrapper = mount(YouTubePlayerSurface, {
      props: {
        videoId: "IQsLEaj89bg",
      },
    });
    const player = await waitForPlayer();
    player.options.events?.onReady?.({ target: player } as YouTubePlayerEvent);
    await nextTick();

    expect(wrapper.emitted("playing")).toBeUndefined();
    expect(wrapper.emitted("ended")).toBeUndefined();

    player.options.events?.onStateChange?.({
      target: player,
      data: youtubeApi.states.playing,
    } as YouTubePlayerStateChangeEvent);
    await nextTick();

    expect(wrapper.emitted("playing")).toEqual([[]]);

    player.options.events?.onStateChange?.({
      target: player,
      data: youtubeApi.states.ended,
    } as YouTubePlayerStateChangeEvent);
    await nextTick();

    expect(wrapper.emitted("ended")).toEqual([[]]);

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

    await seekSlider(wrapper).setValue(42);
    expect(player.seekTo).not.toHaveBeenCalled();

    await seekSlider(wrapper).trigger("change");
    expect(player.seekTo).toHaveBeenCalledWith(42, true);

    wrapper.unmount();
  });

  it("keeps seek preview stable while player polling reports the actual time", async () => {
    vi.useFakeTimers();
    const { player, wrapper } = await mountReadyPlayer();

    await seekSlider(wrapper).setValue(42);
    await nextTick();

    player.currentTime = 7;
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();

    expect(seekSlider(wrapper).element.valueAsNumber).toBe(42);
    expect(wrapper.text()).toContain("0:07");

    wrapper.unmount();
  });

  it("keeps a committed seek target until the player snapshot reaches it", async () => {
    vi.useFakeTimers();
    const { player, wrapper } = await mountReadyPlayer();

    player.currentTime = 10;
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();

    player.seekTo.mockImplementationOnce(() => undefined);
    await seekSlider(wrapper).setValue(42);
    await seekSlider(wrapper).trigger("change");
    await nextTick();

    player.currentTime = 11;
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();

    expect(seekSlider(wrapper).element.valueAsNumber).toBe(42);

    player.currentTime = 43;
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();

    expect(seekSlider(wrapper).element.valueAsNumber).toBe(43);

    wrapper.unmount();
  });

  it("shows the seek time preview while hovering and dragging the progress bar", async () => {
    const { wrapper } = await mountReadyPlayer();
    const progress = progressBar(wrapper);
    expect(wrapper.get(".youtube-player__seek").classes()).toContain(
      "rp-slider--thumb-interaction",
    );
    expect(wrapper.get(".youtube-player__volume").classes()).not.toContain(
      "rp-slider--thumb-interaction",
    );
    stubElementRect(progress.element, { left: 100, top: 0, width: 200, height: 20 });

    await progress.trigger("pointermove", { clientX: 200, clientY: 10 });

    expect(wrapper.get(".youtube-player__seek-preview").text()).toBe("1:00");
    expect(progress.attributes("style")).toContain("--youtube-player-preview-left: 100px");

    await progress.trigger("pointerdown", { clientX: 100, clientY: 10 });

    expect(wrapper.get(".youtube-player__seek-preview").text()).toBe("0:00");
    expect(progress.attributes("style")).toContain("--youtube-player-preview-left: 8px");
    expect(progress.attributes("style")).not.toContain("--youtube-player-preview-shift");

    await progress.trigger("pointerleave");

    expect(wrapper.find(".youtube-player__seek-preview").exists()).toBe(true);

    await progress.trigger("pointermove", { clientX: 300, clientY: 10 });

    expect(wrapper.get(".youtube-player__seek-preview").text()).toBe("2:00");
    expect(progress.attributes("style")).toContain("--youtube-player-preview-left: 192px");
    expect(progress.attributes("style")).not.toContain("--youtube-player-preview-shift");

    await progress.trigger("pointerup", { clientX: 100, clientY: 10 });
    await progress.trigger("pointerleave");

    expect(wrapper.find(".youtube-player__seek-preview").exists()).toBe(false);

    wrapper.unmount();
  });

  it("sets volume and maps zero to mute", async () => {
    const { player, wrapper } = await mountReadyPlayer();

    await wrapper.get<HTMLInputElement>('.youtube-player__volume input[type="range"]').setValue(0);
    expect(player.setVolume).toHaveBeenCalledWith(0);
    expect(player.mute).toHaveBeenCalledTimes(1);

    await wrapper.get<HTMLInputElement>('.youtube-player__volume input[type="range"]').setValue(35);
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
    const timersBeforeUnmount = vi.getTimerCount();
    expect(timersBeforeUnmount).toBeGreaterThanOrEqual(1);

    wrapper.unmount();

    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBeLessThan(timersBeforeUnmount);
  });
});
