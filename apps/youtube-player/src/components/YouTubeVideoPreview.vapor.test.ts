import { mountVaporTest as mount } from "~/test/mountVapor";
import { afterEach, describe, expect, it, vi } from "vitest";

import YouTubeVideoPreview from "./YouTubeVideoPreview.vue";

vi.mock("./YouTubePlayerSurface.vue", async () => {
  const { defineVaporComponent, renderEffect } = await import("vue");
  return {
    default: defineVaporComponent(
      (
        props: Record<string, unknown>,
        { emit }: { emit: (event: string, ...args: unknown[]) => void },
      ) => {
        const player = document.createElement("div");
        player.className = "shared-youtube-player";
        player.addEventListener("click", () => emit("aspect-ratio-change", 0.5625));
        player.addEventListener("dblclick", () => emit("ended"));
        player.addEventListener("pointerdown", () => emit("playing"));
        renderEffect(() => {
          player.dataset.autoplayRevision = String(props.autoplayRevision);
          player.dataset.controlsEnabled = String(props.controlsEnabled);
          player.dataset.fit = String(props.fit);
          player.dataset.muted = String(props.muted);
          player.dataset.overscan = String(props.overscan);
          player.dataset.privacyEnhanced = String(props.privacyEnhanced);
          player.dataset.videoId = String(props.videoId);
        });
        return player;
      },
      {
        emits: ["aspect-ratio-change", "ended", "playing"],
        props: [
          "autoplayRevision",
          "controlsEnabled",
          "fit",
          "muted",
          "overscan",
          "privacyEnhanced",
          "videoId",
        ],
      },
    ),
  };
});

describe("YouTubeVideoPreview", () => {
  afterEach(() => {
    delete document.documentElement.dataset.shell;
  });

  it("renders the shared YouTube player surface for a video URL", () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
        args: { url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
        surface: "blog.embed",
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes("data-video-id")).toBe("M7lc1UVf-VE");
    expect(wrapper.find(".shared-youtube-player").attributes("data-autoplay-revision")).toBe("0");
    expect(wrapper.find(".shared-youtube-player").attributes("data-controls-enabled")).toBe("true");
    expect(wrapper.find(".shared-youtube-player").attributes("data-fit")).toBe("contain");
    expect(wrapper.find(".shared-youtube-player").attributes("data-muted")).toBe("false");
    expect(wrapper.find(".shared-youtube-player").attributes("data-overscan")).toBe("1");
    expect(wrapper.find(".shared-youtube-player").attributes("data-privacy-enhanced")).toBe(
      "false",
    );
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("forwards aspect ratio changes from the shared YouTube player surface", async () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
        args: { url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
        surface: "movies.trailer",
      },
    });

    await wrapper.get(".shared-youtube-player").trigger("click");

    expect(wrapper.emitted("aspect-ratio-change")).toEqual([[0.5625]]);
  });

  it("forwards playing events from the shared YouTube player surface", async () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "youtube-player://video/M7lc1UVf-VE?autoplay=1&fit=cover" },
        args: { autoplay: true, videoId: "M7lc1UVf-VE" },
        surface: "movies.trailer",
      },
    });

    await wrapper.get(".shared-youtube-player").trigger("pointerdown");

    expect(wrapper.emitted("playing")).toEqual([[]]);
  });

  it("forwards ended events from the shared YouTube player surface", async () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "youtube-player://video/M7lc1UVf-VE?autoplay=1&fit=cover" },
        args: { autoplay: true, videoId: "M7lc1UVf-VE" },
        surface: "movies.trailer",
      },
    });

    await wrapper.get(".shared-youtube-player").trigger("dblclick");

    expect(wrapper.emitted("ended")).toEqual([[]]);
  });

  it("enables chromeless autoplay for Movies trailer previews", () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "youtube-player://video/M7lc1UVf-VE?autoplay=1" },
        args: { autoplay: true, videoId: "M7lc1UVf-VE" },
        surface: "movies.trailer",
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes()).toMatchObject({
      "data-autoplay-revision": "1",
      "data-controls-enabled": "false",
      "data-fit": "contain",
      "data-muted": "false",
      "data-overscan": "1",
      "data-privacy-enhanced": "true",
      "data-video-id": "M7lc1UVf-VE",
    });
  });

  it("mutes Movies trailer previews in the mobile shell", () => {
    document.documentElement.dataset.shell = "mobile";

    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "youtube-player://video/M7lc1UVf-VE?autoplay=1&fit=cover" },
        args: { autoplay: true, videoId: "M7lc1UVf-VE" },
        surface: "movies.trailer",
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes()).toMatchObject({
      "data-controls-enabled": "false",
      "data-fit": "cover",
      "data-muted": "true",
      "data-privacy-enhanced": "true",
      "data-video-id": "M7lc1UVf-VE",
    });
  });

  it("uses cover fit with automatic overscan when Movies trailer previews request it", () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "youtube-player://video/M7lc1UVf-VE?autoplay=1&fit=cover" },
        args: { autoplay: true, videoId: "M7lc1UVf-VE" },
        surface: "movies.trailer",
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes()).toMatchObject({
      "data-autoplay-revision": "1",
      "data-controls-enabled": "false",
      "data-fit": "cover",
      "data-muted": "false",
      "data-overscan": "auto",
      "data-privacy-enhanced": "true",
      "data-video-id": "M7lc1UVf-VE",
    });
  });

  it("does not autoplay non-trailer previews even when args request it", () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "youtube-player://video/M7lc1UVf-VE?autoplay=1" },
        args: { autoplay: true, videoId: "M7lc1UVf-VE" },
        surface: "blog.embed",
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes()).toMatchObject({
      "data-autoplay-revision": "0",
      "data-controls-enabled": "true",
      "data-muted": "false",
      "data-privacy-enhanced": "false",
      "data-video-id": "M7lc1UVf-VE",
    });
  });

  it("prefers provider args over the preview input URL", () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
        args: { videoId: "dQw4w9WgXcQ" },
        surface: "blog.embed",
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes("data-video-id")).toBe("dQw4w9WgXcQ");
  });

  it("renders an unavailable state when the input does not resolve to a video", () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "https://example.com" },
        args: {},
        surface: "blog.embed",
      },
    });

    expect(wrapper.find(".shared-youtube-player").exists()).toBe(false);
    expect(wrapper.find(".youtube-video-preview__state").text()).toBe("Video unavailable");
  });
});
