import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";

import YouTubeVideoPreview from "./YouTubeVideoPreview.vue";

const YouTubePlayerSurfaceStub = defineComponent({
  emits: ["aspect-ratio-change", "ended", "playing"],
  props: {
    autoplayRevision: {
      default: 0,
      type: Number,
    },
    controlsEnabled: {
      default: true,
      type: Boolean,
    },
    fit: {
      default: "contain",
      type: String,
    },
    overscan: {
      default: 1,
      type: Number,
    },
    privacyEnhanced: {
      default: false,
      type: Boolean,
    },
    videoId: {
      required: true,
      type: String,
    },
  },
  template:
    '<div class="shared-youtube-player" :data-autoplay-revision="String(autoplayRevision)" :data-controls-enabled="String(controlsEnabled)" :data-fit="fit" :data-overscan="String(overscan)" :data-privacy-enhanced="String(privacyEnhanced)" :data-video-id="videoId" @click="$emit(\'aspect-ratio-change\', 0.5625)" @dblclick="$emit(\'ended\')" @pointerdown="$emit(\'playing\')" />',
});

describe("YouTubeVideoPreview", () => {
  it("renders the shared YouTube player surface for a video URL", () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
        args: { url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
        surface: "blog.embed",
      },
      global: {
        stubs: {
          YouTubePlayerSurface: YouTubePlayerSurfaceStub,
        },
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes("data-video-id")).toBe("M7lc1UVf-VE");
    expect(wrapper.find(".shared-youtube-player").attributes("data-autoplay-revision")).toBe("0");
    expect(wrapper.find(".shared-youtube-player").attributes("data-controls-enabled")).toBe("true");
    expect(wrapper.find(".shared-youtube-player").attributes("data-fit")).toBe("contain");
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
      global: {
        stubs: {
          YouTubePlayerSurface: YouTubePlayerSurfaceStub,
        },
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
      global: {
        stubs: {
          YouTubePlayerSurface: YouTubePlayerSurfaceStub,
        },
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
      global: {
        stubs: {
          YouTubePlayerSurface: YouTubePlayerSurfaceStub,
        },
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
      global: {
        stubs: {
          YouTubePlayerSurface: YouTubePlayerSurfaceStub,
        },
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes()).toMatchObject({
      "data-autoplay-revision": "1",
      "data-controls-enabled": "false",
      "data-fit": "contain",
      "data-overscan": "1",
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
      global: {
        stubs: {
          YouTubePlayerSurface: YouTubePlayerSurfaceStub,
        },
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes()).toMatchObject({
      "data-autoplay-revision": "1",
      "data-controls-enabled": "false",
      "data-fit": "cover",
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
      global: {
        stubs: {
          YouTubePlayerSurface: YouTubePlayerSurfaceStub,
        },
      },
    });

    expect(wrapper.find(".shared-youtube-player").attributes()).toMatchObject({
      "data-autoplay-revision": "0",
      "data-controls-enabled": "true",
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
      global: {
        stubs: {
          YouTubePlayerSurface: YouTubePlayerSurfaceStub,
        },
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
      global: {
        stubs: {
          YouTubePlayerSurface: YouTubePlayerSurfaceStub,
        },
      },
    });

    expect(wrapper.find(".shared-youtube-player").exists()).toBe(false);
    expect(wrapper.find(".youtube-video-preview__state").text()).toBe("Video unavailable");
  });
});
