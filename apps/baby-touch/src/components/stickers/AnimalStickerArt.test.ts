import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { ANIMAL_KINDS } from "../../babyTouchStickerSets";
import AnimalStickerArt from "./AnimalStickerArt.vue";

describe("AnimalStickerArt", () => {
  for (const kind of ANIMAL_KINDS) {
    it(`renders the ${kind} sticker art`, () => {
      const wrapper = mount(AnimalStickerArt, {
        props: { kind },
      });

      const art = wrapper.find("svg");
      expect(art.exists()).toBe(true);
      expect(art.classes()).toContain("baby-touch__sticker-art");
      expect(art.classes()).toContain(`baby-touch__animal--${kind}`);
    });
  }

  it("falls back to bear art for unknown animal kinds", () => {
    const wrapper = mount(AnimalStickerArt, {
      props: { kind: "unknown" },
    });

    const art = wrapper.find("svg");
    expect(art.exists()).toBe(true);
    expect(art.classes()).toContain("baby-touch__animal--bear");
  });
});
