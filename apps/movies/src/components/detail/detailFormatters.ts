import type {
  MovieDetail,
  MoviePersonCredit,
  MovieSeason,
  MovieSeasonEpisode,
} from "../../moviesApi";

export function detailMetaLabel(movie: MovieDetail): string {
  return [
    movie.mediaType === "tv" ? "TV" : "Movie",
    movie.year,
    movie.rating === null ? "" : `${movie.rating.toFixed(1)} TMDB`,
    movie.runtime === null ? "" : `${movie.runtime} min`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function episodeCountLabel(count: number | null): string {
  if (count === null || !Number.isFinite(count)) {
    return "";
  }
  return count === 1 ? "1 episode" : `${count} episodes`;
}

export function episodeTotalLabel(value: string): string {
  const count = Number(value);
  return Number.isFinite(count) ? episodeCountLabel(count) : value;
}

export function episodeLabel(episode: MovieSeasonEpisode): string {
  return `Episode ${episode.episodeNumber}`;
}

export function episodeMetaLabel(episode: MovieSeasonEpisode): string {
  return [
    episode.airDate,
    episode.runtime === null ? "" : `${episode.runtime} min`,
    episode.rating === null ? "" : `${episode.rating.toFixed(1)} rating`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function personMetaLabel(person: MoviePersonCredit): string {
  return [person.role, episodeCountLabel(person.episodeCount)].filter(Boolean).join(" · ");
}

export function seasonLabel(season: MovieSeason): string {
  return season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`;
}

export function seasonMetaLabel(season: MovieSeason): string {
  return [season.year, episodeCountLabel(season.episodeCount)].filter(Boolean).join(" · ");
}
