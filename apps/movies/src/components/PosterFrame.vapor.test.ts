import { describe, expect, it } from "vitest";

import { mountVaporTest as mount } from "~/test/mountVapor";

import PosterFrame from "./PosterFrame.vue";

describe("PosterFrame", () => {
  it("keeps poster overlays inside a single AspectRatio media layer", () => {
    const wrapper = mount(PosterFrame, {
      props: {
        alt: "The Odyssey",
        src: "https://image.tmdb.org/t/p/w500/poster.jpg",
      },
      slots: {
        default: '<span class="movie-card__badge">Movie</span>',
      },
    });

    const aspectRatio = wrapper.get<HTMLElement>(".rp-aspect-ratio").element;
    const content = wrapper.get<HTMLElement>(".movies-poster-frame__content").element;
    const badge = wrapper.get<HTMLElement>(".movie-card__badge").element;

    expect(Array.from(aspectRatio.children)).toEqual([content]);
    expect(content.querySelector(".movies-poster-frame__image")).not.toBeNull();
    expect(badge.parentElement).toBe(content);
  });
});
