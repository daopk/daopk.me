import { moviesPathForView, type MoviesView } from "../moviesRoutes";
import { movieSlugFromText } from "./movieSlug";

export type MovieBrowserMediaType = "movie" | "tv";

export function movieServerSlug(serverName: string): string {
  return movieSlugFromText(serverName, "server");
}

export function replaceBrowserPath(pathname: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (
    window.location.pathname === pathname &&
    window.location.search === "" &&
    window.location.hash === ""
  ) {
    return;
  }

  window.history.replaceState(window.history.state, "", pathname);
}

export function replaceMoviesAppPath(): void {
  replaceBrowserPath("/apps/movies");
}

export function replaceMoviesViewPath(view: MoviesView): void {
  replaceBrowserPath(moviesPathForView(view));
}

export function replaceMovieDetailPath(
  mediaType: MovieBrowserMediaType,
  tmdbId: number,
  slug: string,
): void {
  replaceMoviesViewPath({ mediaType, name: "detail", slug, tmdbId });
}

export function replaceMoviePersonPath(tmdbId: number, slug: string): void {
  replaceMoviesViewPath({ name: "person", slug, tmdbId });
}

export function replaceMovieEpisodePath(
  tmdbId: number,
  slug: string,
  seasonNumber: number,
  episodeNumber: number,
): void {
  replaceMoviesViewPath({ episodeNumber, name: "episode", seasonNumber, slug, tmdbId });
}
