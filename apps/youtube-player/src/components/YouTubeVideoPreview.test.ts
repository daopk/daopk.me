import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";

import YouTubeVideoPreview from "./YouTubeVideoPreview.vue";

const YouTubePlayerSurfaceStub = defineComponent({
  props: {
    videoId: {
      required: true,
      type: String,
    },
  },
  template: '<div class="shared-youtube-player" :data-video-id="videoId" />',
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
    expect(wrapper.find("button").exists()).toBe(false);
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
