import { describe, expect, it } from "vitest";

import { blogCommentTarget, mediaCommentTarget } from "./commentTargets";

describe("comment targets", () => {
  it("creates stable blog comment IDs independent of title and current URL", () => {
    expect(blogCommentTarget("moving-apps-out-of-the-shell", "Moving apps")).toEqual({
      canonicalUrl: "https://daopk.me/blog/moving-apps-out-of-the-shell",
      id: "blog:moving-apps-out-of-the-shell",
      title: "Moving apps",
    });

    expect(blogCommentTarget("moving-apps-out-of-the-shell", "Renamed title")?.id).toBe(
      "blog:moving-apps-out-of-the-shell",
    );
  });

  it("rejects unsafe blog slugs", () => {
    expect(blogCommentTarget("FIELD-NOTES", "Field Notes")).toBeNull();
    expect(blogCommentTarget("../field-notes", "Field Notes")).toBeNull();
  });

  it("creates future-ready media comment IDs from TMDB IDs", () => {
    expect(mediaCommentTarget("movie", 550, "Fight Club", "fight-club")).toEqual({
      canonicalUrl: "https://daopk.me/movie/550-fight-club",
      id: "movie:550",
      title: "Fight Club",
    });
    expect(mediaCommentTarget("tv", 1399, "Game of Thrones", "game-of-thrones")?.id).toBe(
      "tv:1399",
    );
  });
});
