import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import PhotoLightbox from "./PhotoLightbox.vue";
import type { Photo } from "./usePhotos";

const FocusTrapStub = defineComponent({
  name: "FocusTrap",
  setup(_props, { slots }) {
    return () => slots.default?.();
  },
});

function photo(key: string): Photo {
  return {
    key,
    url: `/public/photos/${key}`,
    size: 0,
    uploaded: null,
    contentType: "image/jpeg",
  };
}

function mountLightbox(index: number) {
  const photos = [photo("a.jpg"), photo("2026/sunset.jpg"), photo("c.png")];
  return mount(PhotoLightbox, {
    props: { photos, index },
    global: { stubs: { FocusTrap: FocusTrapStub } },
  });
}

describe("PhotoLightbox", () => {
  it("renders the active photo at full resolution", () => {
    const wrapper = mountLightbox(1);

    expect(wrapper.get(".photos__lightbox-image").attributes("src")).toBe(
      "/public/photos/2026/sunset.jpg",
    );
    expect(wrapper.get(".photos__lightbox-title").text()).toBe("sunset");
  });

  it("emits close from the close control", async () => {
    const wrapper = mountLightbox(0);

    await wrapper.get('[aria-label="Close photo viewer"]').trigger("click");

    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("steps the index with the navigation buttons", async () => {
    const wrapper = mountLightbox(1);

    await wrapper.get('[aria-label="Next photo"]').trigger("click");
    await wrapper.get('[aria-label="Previous photo"]').trigger("click");

    expect(wrapper.emitted("update:index")).toEqual([[2], [0]]);
  });

  it("hides previous at the first photo and next at the last", () => {
    const first = mountLightbox(0);
    expect(first.find('[aria-label="Previous photo"]').exists()).toBe(false);
    expect(first.find('[aria-label="Next photo"]').exists()).toBe(true);

    const last = mountLightbox(2);
    expect(last.find('[aria-label="Next photo"]').exists()).toBe(false);
    expect(last.find('[aria-label="Previous photo"]').exists()).toBe(true);
  });
});
