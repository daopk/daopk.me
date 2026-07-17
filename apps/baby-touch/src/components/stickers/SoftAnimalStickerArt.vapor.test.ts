import { mountVaporTest as mount } from "~/test/mountVapor";
import { describe, expect, it } from "vitest";

import { SOFT_ANIMAL_KINDS } from "../../babyTouchStickerSets";
import SoftAnimalStickerArt from "./SoftAnimalStickerArt.vue";

describe("SoftAnimalStickerArt", () => {
  for (const kind of SOFT_ANIMAL_KINDS) {
    it(`renders the ${kind} sticker art`, () => {
      const wrapper = mount(SoftAnimalStickerArt, {
        props: { kind },
      });

      const art = wrapper.find("img");
      expect(art.exists()).toBe(true);
      expect(art.classes()).toContain("baby-touch__sticker-art");
      expect(art.classes()).toContain(`baby-touch__soft-animal--${kind}`);
      expect(art.attributes("src")).toContain(`${kind}.png`);
    });
  }

  it("falls back to the first soft animal art for unknown soft animal kinds", () => {
    const wrapper = mount(SoftAnimalStickerArt, {
      props: { kind: "unknown" },
    });

    const art = wrapper.find("img");
    expect(art.exists()).toBe(true);
    expect(art.classes()).toContain("baby-touch__soft-animal--soft-animal-01");
  });
});
