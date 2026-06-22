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

  it("forwards preview aspect ratio changes from the provider component", async () => {
    const input: AppPreviewInput = { kind: "url", url: "https://youtu.be/M7lc1UVf-VE" };
    const PreviewComponent = defineComponent({
      emits: ["aspect-ratio-change"],
      mounted() {
        this.$emit("aspect-ratio-change", 0.5625);
      },
      template: '<div class="preview-probe" />',
    });
    const provider: AppPreviewProvider = {
      id: "youtube-player:video-preview",
      manifestId: "youtube-player",
      surfaces: ["movies.trailer"],
      component: () => Promise.resolve({ default: PreviewComponent }),
      match: () => ({ args: { videoId: "M7lc1UVf-VE" } }),
    };
    const kernel = {
      previews: {
        resolve: vi.fn(() => ({ provider, args: { videoId: "M7lc1UVf-VE" } })),
      },
    } as unknown as Kernel;

    const wrapper = mount(PreviewHost, {
      props: { input, surface: "movies.trailer" },
      global: { provide: { [KernelInjectionKey as symbol]: kernel } },
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.emitted("aspect-ratio-change")).toEqual([[0.5625]]);
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
