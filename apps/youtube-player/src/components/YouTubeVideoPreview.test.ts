import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import { KernelInjectionKey, type Kernel } from "@daopk/sdk";

import YouTubeVideoPreview from "./YouTubeVideoPreview.vue";

function makeKernel(): Kernel {
  return {
    events: {
      emit: vi.fn(),
      on: vi.fn(() => () => undefined),
      once: vi.fn(() => () => undefined),
      off: vi.fn(),
    },
  } as unknown as Kernel;
}

describe("YouTubeVideoPreview", () => {
  it("renders a thumbnail button and launches YouTube Player", async () => {
    const kernel = makeKernel();
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
        args: { url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
        surface: "blog.embed",
      },
      global: {
        provide: {
          [KernelInjectionKey as symbol]: kernel,
        },
      },
    });

    expect(wrapper.find("img").attributes("src")).toContain("/M7lc1UVf-VE/");

    await wrapper.find("button").trigger("click");

    expect(kernel.events.emit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "youtube-player",
      source: "deeplink",
      args: { url: "https://www.youtube.com/watch?v=M7lc1UVf-VE" },
    });
  });

  it("disables itself when the input does not resolve to a video", () => {
    const wrapper = mount(YouTubeVideoPreview, {
      props: {
        input: { kind: "url", url: "https://example.com" },
        args: {},
        surface: "blog.embed",
      },
      global: {
        provide: {
          [KernelInjectionKey as symbol]: makeKernel(),
        },
      },
    });

    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });
});
