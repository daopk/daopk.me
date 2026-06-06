function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

export type MovieBrowserMediaType = "movie" | "tv";

function slugFromText(value: string): string {
  return value
    .replace(/\u0110/g, "D")
    .replace(/\u0111/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function movieServerSlug(serverName: string): string {
  return slugFromText(serverName) || "server";
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

export function replaceMovieDetailPath(
  mediaType: MovieBrowserMediaType,
  tmdbId: number,
  slug: string,
): void {
  replaceBrowserPath(`/${mediaType}/${tmdbId}-${pathSegment(slug)}`);
}

export function replaceMoviePersonPath(tmdbId: number, slug: string): void {
  replaceBrowserPath(`/person/${tmdbId}-${pathSegment(slug)}`);
}

export function replaceMovieEpisodePath(
  tmdbId: number,
  slug: string,
  seasonNumber: number,
  episodeNumber: number,
): void {
  replaceBrowserPath(
    `/tv/${tmdbId}-${pathSegment(slug)}/season/${seasonNumber}/episode/${episodeNumber}`,
  );
}
