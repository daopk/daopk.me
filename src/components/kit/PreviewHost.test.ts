import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";

import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import type { AppPreviewInput, AppPreviewProvider } from "~/types/preview";

import PreviewHost from "./PreviewHost.vue";

describe("PreviewHost", () => {
  it("renders a resolved app preview provider", async () => {
    const input: AppPreviewInput = { kind: "url", url: "https://youtu.be/M7lc1UVf-VE" };
    const PreviewComponent = defineComponent({
      props: ["args", "input", "surface"],
      template:
        '<div class="preview-probe">{{ surface }}:{{ args.videoId }}:{{ input.kind }}</div>',
    });
    const provider: AppPreviewProvider = {
      id: "youtube-player:video-preview",
      manifestId: "youtube-player",
      surfaces: ["blog.embed"],
      component: () => Promise.resolve({ default: PreviewComponent }),
      match: () => ({ args: { videoId: "M7lc1UVf-VE" } }),
    };
    const resolve = vi.fn(() => ({
      provider,
      args: { videoId: "M7lc1UVf-VE" },
    }));
    const kernel = { previews: { resolve } } as unknown as Kernel;

    const wrapper = mount(PreviewHost, {
      props: { input, surface: "blog.embed" },
      global: { provide: { [KernelInjectionKey as symbol]: kernel } },
    });

    await flushPromises();
    await nextTick();

    expect(resolve).toHaveBeenCalledWith(input, { surface: "blog.embed" });
    expect(wrapper.find(".preview-probe").text()).toBe("blog.embed:M7lc1UVf-VE:url");
  });

  it("renders the fallback when no provider matches", () => {
    const kernel = {
      previews: {
        resolve: vi.fn(() => null),
      },
    } as unknown as Kernel;

    const wrapper = mount(PreviewHost, {
      props: {
        input: { kind: "url", url: "https://example.com" },
        surface: "blog.embed",
        fallbackTitle: "No preview",
      },
      global: { provide: { [KernelInjectionKey as symbol]: kernel } },
    });

    expect(wrapper.text()).toContain("No preview");
  });
});
