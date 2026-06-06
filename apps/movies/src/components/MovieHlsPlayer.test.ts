// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MovieHlsPlayer from "./MovieHlsPlayer.vue";
import type { MoviePlayInfo } from "../moviesApi";

const hlsMock = vi.hoisted(() => {
  type HlsHandler = (event: string, data: { fatal?: boolean }) => void;

  const instances: MockHls[] = [];

  class MockHls {
    static Events = { ERROR: "hlsError" };
    static isSupported = vi.fn(() => true);

    attachMedia = vi.fn();
    destroy = vi.fn();
    handlers = new Map<string, HlsHandler>();
    loadSource = vi.fn();
    on = vi.fn((event: string, handler: HlsHandler) => {
      this.handlers.set(event, handler);
    });

    constructor() {
      instances.push(this);
    }

    emitFatalError(): void {
      this.handlers.get(MockHls.Events.ERROR)?.(MockHls.Events.ERROR, { fatal: true });
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
  await flushPromises();
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
  hlsMock.MockHls.isSupported.mockReturnValue(options.hlsJs);
}

describe("MovieHlsPlayer", () => {
  beforeEach(() => {
    hlsMock.instances.length = 0;
    hlsMock.MockHls.isSupported.mockReset();
    setMediaSupport({ hlsJs: true, nativeHls: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses native HLS when the browser can play m3u8", async () => {
    setMediaSupport({ hlsJs: false, nativeHls: true });

    const wrapper = mount(MovieHlsPlayer, {
      props: {
        play: playInfo(),
        posterUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
        title: "Fight Club",
      },
    });
    await settle();

    const video = wrapper.get("video").element as HTMLVideoElement;
    expect(video.src).toBe("https://stream.example.test/fight-club/master.m3u8");
    expect(hlsMock.instances).toHaveLength(0);
  });

  it("attaches hls.js when native HLS is unavailable", async () => {
    const wrapper = mount(MovieHlsPlayer, {
      props: {
        play: playInfo(),
        title: "Fight Club",
      },
    });
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

    const wrapper = mount(MovieHlsPlayer, {
      props: {
        play: playInfo(),
        title: "Fight Club",
      },
    });
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
    const wrapper = mount(MovieHlsPlayer, {
      props: {
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
        title: "Fight Club",
      },
    });
    await settle();

    const firstInstance = hlsMock.instances[0]!;
    await wrapper.get("select").setValue("1");
    await settle();

    expect(firstInstance.destroy).toHaveBeenCalledTimes(1);
    expect(hlsMock.instances).toHaveLength(2);
    expect(hlsMock.instances[1]!.loadSource).toHaveBeenCalledWith(
      "https://stream.example.test/fight-club/alt.m3u8",
    );
  });

  it("shows an error when HLS is unsupported", async () => {
    setMediaSupport({ hlsJs: false, nativeHls: false });

    const wrapper = mount(MovieHlsPlayer, {
      props: {
        play: playInfo(),
        title: "Fight Club",
      },
    });
    await settle();

    expect(wrapper.text()).toContain("This browser cannot play this stream.");
  });

  it("shows an error for fatal hls.js failures", async () => {
    const wrapper = mount(MovieHlsPlayer, {
      props: {
        play: playInfo(),
        title: "Fight Club",
      },
    });
    await settle();

    hlsMock.instances[0]!.emitFatalError();
    await settle();

    expect(wrapper.text()).toContain("Could not play this stream.");
    expect(hlsMock.instances[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys hls.js on unmount", async () => {
    const wrapper = mount(MovieHlsPlayer, {
      props: {
        play: playInfo(),
        title: "Fight Club",
      },
    });
    await settle();

    const instance = hlsMock.instances[0]!;
    wrapper.unmount();

    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });
});
