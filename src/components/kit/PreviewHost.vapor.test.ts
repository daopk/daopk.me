import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it, vi } from "vitest";
import { defineVaporComponent, nextTick, onMounted, renderEffect } from "vue";

import { KernelInjectionKey, type Kernel } from "~/types/kernel";
import type { AppPreviewInput, AppPreviewProvider } from "~/types/preview";

import PreviewHost from "./PreviewHost.vue";

describe("PreviewHost", () => {
  it("renders a resolved app preview provider", async () => {
    const input: AppPreviewInput = { kind: "url", url: "https://youtu.be/M7lc1UVf-VE" };
    const PreviewComponent = defineVaporComponent(
      (props: {
        readonly args: { readonly videoId: string };
        readonly input: AppPreviewInput;
        readonly surface: string;
      }) => {
        const element = document.createElement("div");
        element.className = "preview-probe";
        renderEffect(() => {
          element.textContent = `${props.surface}:${props.args.videoId}:${props.input.kind}`;
        });
        return element;
      },
      { props: ["args", "input", "surface"] },
    );
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

  it("forwards preview lifecycle events from the provider component", async () => {
    const input: AppPreviewInput = { kind: "url", url: "https://youtu.be/M7lc1UVf-VE" };
    const PreviewComponent = defineVaporComponent(
      (_props, { emit }) => {
        const element = document.createElement("div");
        element.className = "preview-probe";
        onMounted(() => {
          emit("aspect-ratio-change", 0.5625);
          emit("playing");
          emit("ended");
        });
        return element;
      },
      { emits: ["aspect-ratio-change", "ended", "playing"] },
    );
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
    expect(wrapper.emitted("playing")).toEqual([[]]);
    expect(wrapper.emitted("ended")).toEqual([[]]);
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
