import type {
  MovieDetail,
  MoviePersonCredit,
  MovieSeason,
  MovieSeasonEpisode,
} from "../../moviesApi";
import { mediaLabel, moviesText } from "../../i18n/labels";
import type { MoviesTranslate } from "../../i18n/useMoviesI18n";

export function detailMetaLabel(movie: MovieDetail, t?: MoviesTranslate): string {
  return [
    mediaLabel(movie.mediaType, t, movie.mediaType === "tv" ? "short" : "singular"),
    movie.year,
    movie.rating === null
      ? ""
      : moviesText(t, "movies.format.rating.tmdb", "{rating} TMDB", {
          rating: movie.rating.toFixed(1),
        }),
    movie.runtime === null
      ? ""
      : moviesText(t, "movies.format.minute.short", "{count} min", { count: movie.runtime }),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function episodeCountLabel(count: number | null, t?: MoviesTranslate): string {
  if (count === null || !Number.isFinite(count)) {
    return "";
  }
  return count === 1
    ? moviesText(t, "movies.format.episodeCount.one", "1 episode")
    : moviesText(t, "movies.format.episodeCount.many", "{count} episodes", { count });
}

export function episodeTotalLabel(value: string, t?: MoviesTranslate): string {
  const count = Number(value);
  return Number.isFinite(count) ? episodeCountLabel(count, t) : value;
}

export function episodeLabel(episode: MovieSeasonEpisode, t?: MoviesTranslate): string {
  return moviesText(t, "movies.format.episode", "Episode {number}", {
    number: episode.episodeNumber,
  });
}

export function episodeMetaLabel(episode: MovieSeasonEpisode, t?: MoviesTranslate): string {
  return [
    episode.airDate,
    episode.runtime === null
      ? ""
      : moviesText(t, "movies.format.minute.short", "{count} min", { count: episode.runtime }),
    episode.rating === null
      ? ""
      : moviesText(t, "movies.format.rating.label", "{rating} rating", {
          rating: episode.rating.toFixed(1),
        }),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function personMetaLabel(person: MoviePersonCredit, t?: MoviesTranslate): string {
  return [person.role, episodeCountLabel(person.episodeCount, t)].filter(Boolean).join(" · ");
}

export function seasonLabel(season: MovieSeason, t?: MoviesTranslate): string {
  return season.seasonNumber === 0
    ? moviesText(t, "movies.format.specials", "Specials")
    : moviesText(t, "movies.format.season", "Season {number}", {
        number: season.seasonNumber,
      });
}

export function seasonMetaLabel(season: MovieSeason, t?: MoviesTranslate): string {
  return [season.year, episodeCountLabel(season.episodeCount, t)].filter(Boolean).join(" · ");
}
