export const MEDIA_SITE_ORIGIN = "https://daopk.me";
export const MEDIA_SITE_NAME = "daopk.me";
export const MEDIA_SEO_BUCKET = "daopk-movies";
export const MEDIA_SEO_STATE_KEY = "state/media-seo-state.json";
export const MEDIA_SEO_INVENTORY_KEY = "state/page-inventory.ndjson.gz";
export const MEDIA_SEO_PENDING_PREFIX = "pending/on-demand";
export const MEDIA_SEO_MANIFEST_PREFIX = "manifests";
export const MEDIA_SEO_SITEMAP_INDEX_KEY = "sitemaps/media-index.xml";
export const MEDIA_SEO_SITEMAP_PUBLIC_PATH = "/sitemap-media.xml";
export const MEDIA_SEO_SITEMAP_CHUNK_SIZE = 45_000;
export const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export const MEDIA_LOCALES = ["en", "vi"];
export const TMDB_LANGUAGE_BY_LOCALE = {
  en: "en-US",
  vi: "vi-VN",
};

const ID_SLUG_PATTERN = /^([1-9]\d*)-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const TMDB_IMAGE_PATH_PATTERN = /^\/[A-Za-z0-9_.-]+$/;
const SEARCH_TYPES = new Set(["multi", "movie", "tv"]);
const SEARCH_LANGUAGES = new Set(Object.values(TMDB_LANGUAGE_BY_LOCALE));
const HTML_ESCAPE_PATTERN = /[&<>"']/g;
const JSON_HTML_ESCAPE_PATTERN = /[<>&\u2028\u2029]/g;

const HTML_ESCAPE_REPLACEMENTS = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const JSON_HTML_ESCAPE_REPLACEMENTS = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export const MEDIA_SEO_HTML_TEMPLATE = `<!doctype html>
<html lang="{{lang}}">
  <head>
{{headMetadata}}
{{jsonLd}}
{{styles}}
  </head>
  <body>
{{visibleBody}}
{{tmdbAttribution}}
  </body>
</html>
`;

const MEDIA_SEO_STYLES = `<style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        background: #f5f6f8;
        color: #202124;
        margin: 0;
      }

      a {
        color: inherit;
      }

      .media-page {
        margin: 0 auto;
        max-width: 1120px;
        padding: 40px 20px 56px;
      }

      .media-hero {
        align-items: end;
        background: #1f252d;
        border-radius: 8px;
        color: #fff;
        display: grid;
        min-height: 360px;
        overflow: hidden;
        position: relative;
      }

      .media-hero::before {
        background: linear-gradient(180deg, rgb(13 18 24 / 8%), rgb(13 18 24 / 84%));
        content: "";
        inset: 0;
        position: absolute;
      }

      .media-hero__backdrop {
        height: 100%;
        inset: 0;
        object-fit: cover;
        position: absolute;
        width: 100%;
      }

      .media-hero__content {
        display: grid;
        gap: 22px;
        grid-template-columns: minmax(0, 180px) minmax(0, 1fr);
        padding: 28px;
        position: relative;
      }

      .media-poster {
        aspect-ratio: 2 / 3;
        background: rgb(255 255 255 / 14%);
        border-radius: 6px;
        box-shadow: 0 18px 40px rgb(0 0 0 / 32%);
        object-fit: cover;
        width: 100%;
      }

      .media-kicker {
        color: rgb(255 255 255 / 78%);
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0;
        margin: 0 0 10px;
        text-transform: uppercase;
      }

      h1 {
        font-size: clamp(2.1rem, 6vw, 4rem);
        letter-spacing: 0;
        line-height: 1.02;
        margin: 0;
      }

      .media-meta {
        color: rgb(255 255 255 / 78%);
        display: flex;
        flex-wrap: wrap;
        gap: 8px 14px;
        margin: 14px 0 0;
      }

      .media-overview {
        background: #fff;
        border: 1px solid rgb(32 33 36 / 10%);
        border-radius: 8px;
        margin: 22px 0 0;
        padding: 24px;
      }

      .media-overview h2 {
        font-size: 1rem;
        letter-spacing: 0;
        margin: 0 0 10px;
      }

      .media-overview p {
        font-size: 1.05rem;
        line-height: 1.65;
        margin: 0;
      }

      .media-attribution {
        color: #5f6670;
        font-size: 0.82rem;
        line-height: 1.5;
        margin: 24px auto 0;
        max-width: 1120px;
        padding: 0 20px 40px;
      }

      @media (max-width: 680px) {
        .media-page {
          padding: 18px 12px 40px;
        }

        .media-hero {
          min-height: 0;
        }

        .media-hero__content {
          grid-template-columns: minmax(0, 96px) minmax(0, 1fr);
          padding: 18px;
        }

        h1 {
          font-size: 2rem;
        }
      }

      @media (prefers-color-scheme: dark) {
        body {
          background: #111417;
          color: #f5f7fa;
        }

        .media-overview {
          background: #191e24;
          border-color: rgb(245 247 250 / 12%);
        }

        .media-attribution {
          color: #abb4c0;
        }
      }
    </style>`;

export class MediaSeoError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "MediaSeoError";
    this.status = status;
  }
}

export class MediaSeoNotFoundError extends MediaSeoError {
  constructor(message = "Media SEO item not found.") {
    super(message, 404);
    this.name = "MediaSeoNotFoundError";
  }
}

export function escapeHtml(value) {
  return String(value).replace(
    HTML_ESCAPE_PATTERN,
    (character) => HTML_ESCAPE_REPLACEMENTS[character],
  );
}

export function jsonLdScript(value) {
  return JSON.stringify(cleanJsonLd(value)).replace(
    JSON_HTML_ESCAPE_PATTERN,
    (character) => JSON_HTML_ESCAPE_REPLACEMENTS[character],
  );
}

export function slugifyMediaTitle(value, fallback = "untitled") {
  const slug = String(value ?? "")
    .replace(/[đĐ]/g, "d")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug.length === 0 ? fallback : slug;
}

export function mediaSeoSlugForTitle(tmdbId, title) {
  return slugifyMediaTitle(title, `tmdb-${tmdbId}`);
}

export function parseMediaSeoRoute(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  const locale = segments[0] === "vi" ? "vi" : "en";
  const routeSegments = locale === "vi" ? segments.slice(1) : segments;
  const [mediaSegment, idSlugSegment, seasonSegment, seasonValue, episodeSegment, episodeValue] =
    routeSegments;

  if (mediaSegment !== "movie" && mediaSegment !== "tv") {
    return null;
  }
  if (typeof idSlugSegment !== "string") {
    return null;
  }

  const idSlug = parseIdSlug(idSlugSegment);
  if (idSlug === null) {
    return null;
  }

  if (mediaSegment === "movie") {
    return routeSegments.length === 2
      ? {
          locale,
          mediaType: "movie",
          pageType: "movie",
          tmdbId: idSlug.tmdbId,
          slug: idSlug.slug,
        }
      : null;
  }

  if (routeSegments.length === 2) {
    return {
      locale,
      mediaType: "tv",
      pageType: "tv",
      tmdbId: idSlug.tmdbId,
      slug: idSlug.slug,
    };
  }

  if (seasonSegment !== "season" || !isPositiveIntegerString(seasonValue)) {
    return null;
  }

  const seasonNumber = Number(seasonValue);

  if (routeSegments.length === 4) {
    return {
      locale,
      mediaType: "tv",
      pageType: "season",
      tmdbId: idSlug.tmdbId,
      slug: idSlug.slug,
      seasonNumber,
    };
  }

  if (
    routeSegments.length === 6 &&
    episodeSegment === "episode" &&
    isPositiveIntegerString(episodeValue)
  ) {
    return {
      locale,
      mediaType: "tv",
      pageType: "episode",
      tmdbId: idSlug.tmdbId,
      slug: idSlug.slug,
      seasonNumber,
      episodeNumber: Number(episodeValue),
    };
  }

  return null;
}

export function mediaSeoPublicPath(target) {
  const prefix = target.locale === "vi" ? "/vi" : "";
  const idSlug = `${target.tmdbId}-${target.slug}`;

  if (target.mediaType === "movie") {
    return `${prefix}/movie/${idSlug}`;
  }

  const basePath = `${prefix}/tv/${idSlug}`;
  if (target.pageType === "season") {
    return `${basePath}/season/${target.seasonNumber}`;
  }
  if (target.pageType === "episode") {
    return `${basePath}/season/${target.seasonNumber}/episode/${target.episodeNumber}`;
  }
  return basePath;
}

export function mediaSeoR2KeyForTarget(target) {
  const idSlug = `${target.tmdbId}-${target.slug}`;
  if (target.mediaType === "movie") {
    return `seo/${target.locale}/movie/${idSlug}.html`;
  }

  const baseKey = `seo/${target.locale}/tv/${idSlug}`;
  if (target.pageType === "season") {
    return `${baseKey}/season/${target.seasonNumber}.html`;
  }
  if (target.pageType === "episode") {
    return `${baseKey}/season/${target.seasonNumber}/episode/${target.episodeNumber}.html`;
  }
  return `${baseKey}.html`;
}

export function mediaSeoR2KeyForRoute(route) {
  return mediaSeoR2KeyForTarget(route);
}

export function mediaSeoCanonicalUrl(siteOrigin, target) {
  return `${trimTrailingSlash(siteOrigin)}${mediaSeoPublicPath(target)}`;
}

export function mediaSeoSitemapChunkKey(locale, chunkIndex) {
  return `sitemaps/media-${locale}-${String(chunkIndex).padStart(4, "0")}.xml`;
}

export function mediaSeoSitemapChunkPublicPath(locale, chunkIndex) {
  return `/sitemap-media-${locale}-${String(chunkIndex).padStart(4, "0")}.xml`;
}

export function mediaSeoSitemapKeyForPublicPath(pathname) {
  if (pathname === MEDIA_SEO_SITEMAP_PUBLIC_PATH) {
    return MEDIA_SEO_SITEMAP_INDEX_KEY;
  }

  const match = /^\/sitemap-media-(en|vi)-([0-9]{4})\.xml$/.exec(pathname);
  return match === null ? null : `sitemaps/media-${match[1]}-${match[2]}.xml`;
}

export function pendingOnDemandKey(payload) {
  return `${MEDIA_SEO_PENDING_PREFIX}/${payload.mediaType}/${payload.tmdbId}.json`;
}

export function normalizeEnsurePayload(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MediaSeoError("Expected a JSON object.", 400);
  }

  const mediaType = value.mediaType;
  const tmdbId = toPositiveInteger(value.tmdbId);
  const seasonNumber =
    value.seasonNumber === undefined ? undefined : toPositiveInteger(value.seasonNumber);
  const episodeNumber =
    value.episodeNumber === undefined ? undefined : toPositiveInteger(value.episodeNumber);

  if (mediaType !== "movie" && mediaType !== "tv") {
    throw new MediaSeoError('mediaType must be "movie" or "tv".', 400);
  }
  if (tmdbId === null) {
    throw new MediaSeoError("tmdbId must be a positive integer.", 400);
  }
  if (mediaType === "movie" && (seasonNumber !== undefined || episodeNumber !== undefined)) {
    throw new MediaSeoError("Movie pages cannot include season or episode numbers.", 400);
  }
  if (seasonNumber === null) {
    throw new MediaSeoError("seasonNumber must be a positive integer.", 400);
  }
  if (episodeNumber === null) {
    throw new MediaSeoError("episodeNumber must be a positive integer.", 400);
  }
  if (episodeNumber !== undefined && seasonNumber === undefined) {
    throw new MediaSeoError("episodeNumber requires seasonNumber.", 400);
  }

  return {
    mediaType,
    pageType:
      mediaType === "movie"
        ? "movie"
        : episodeNumber !== undefined
          ? "episode"
          : seasonNumber !== undefined
            ? "season"
            : "tv",
    tmdbId,
    seasonNumber,
    episodeNumber,
  };
}

export function validateMediaSearchParams(searchParams) {
  const query = (searchParams.get("query") ?? "").trim();
  const language = searchParams.get("language") ?? TMDB_LANGUAGE_BY_LOCALE.en;
  const type = searchParams.get("type") ?? "multi";
  const pageValue = searchParams.get("page") ?? "1";
  const page = Number(pageValue);

  if (query.length === 0 || query.length > 100) {
    throw new MediaSeoError("query must be between 1 and 100 characters.", 400);
  }
  if (!SEARCH_LANGUAGES.has(language)) {
    throw new MediaSeoError("language must be en-US or vi-VN.", 400);
  }
  if (!SEARCH_TYPES.has(type)) {
    throw new MediaSeoError("type must be multi, movie, or tv.", 400);
  }
  if (!Number.isInteger(page) || page < 1 || page > 500 || String(page) !== pageValue) {
    throw new MediaSeoError("page must be an integer between 1 and 500.", 400);
  }

  return { query, language, type, page };
}

export async function searchTmdbMedia({
  fetchImpl = globalThis.fetch,
  language = TMDB_LANGUAGE_BY_LOCALE.en,
  page = 1,
  query,
  token,
  type = "multi",
}) {
  const endpoint = type === "multi" ? "/search/multi" : `/search/${type}`;
  const data = await tmdbFetchJson({
    fetchImpl,
    path: endpoint,
    params: {
      include_adult: "false",
      language,
      page: String(page),
      query,
    },
    token,
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  return {
    page: typeof data?.page === "number" ? data.page : page,
    totalPages: typeof data?.total_pages === "number" ? data.total_pages : 0,
    totalResults: typeof data?.total_results === "number" ? data.total_results : 0,
    results: results.map((result) => normalizeSearchResult(result, type)).filter(Boolean),
  };
}

export async function tmdbFetchJson({ fetchImpl = globalThis.fetch, params = {}, path, token }) {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new MediaSeoError("TMDB API token is not configured.", 500);
  }

  const url = new URL(`${TMDB_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new MediaSeoError(`TMDB request failed with status ${response.status}.`, response.status);
  }

  return response.json();
}

export async function fetchTmdbMovieDetails({ fetchImpl, language, tmdbId, token }) {
  return tmdbFetchJson({
    fetchImpl,
    path: `/movie/${tmdbId}`,
    params: { language },
    token,
  });
}

export async function fetchTmdbTvDetails({ fetchImpl, language, tmdbId, token }) {
  return tmdbFetchJson({
    fetchImpl,
    path: `/tv/${tmdbId}`,
    params: { language },
    token,
  });
}

export async function fetchTmdbTvSeasonDetails({
  fetchImpl,
  language,
  seasonNumber,
  tmdbId,
  token,
}) {
  return tmdbFetchJson({
    fetchImpl,
    path: `/tv/${tmdbId}/season/${seasonNumber}`,
    params: { language },
    token,
  });
}

export async function fetchTmdbChangedIds({
  endDate,
  fetchImpl,
  log = () => undefined,
  mediaType,
  startDate,
  token,
}) {
  const path = mediaType === "movie" ? "/movie/changes" : "/tv/changes";
  const ids = new Set();
  let page = 1;
  let totalPages = 1;

  do {
    const data = await tmdbFetchJson({
      fetchImpl,
      path,
      params: {
        end_date: endDate,
        page: String(page),
        start_date: startDate,
      },
      token,
    });

    for (const result of Array.isArray(data?.results) ? data.results : []) {
      const id = toPositiveInteger(result?.id);
      if (id !== null) {
        ids.add(id);
      }
    }

    totalPages = Math.max(1, Math.min(1_000, Number(data?.total_pages) || 1));
    log(`${mediaType} changes page ${page}/${totalPages}`);
    page += 1;
  } while (page <= totalPages);

  return [...ids].sort((a, b) => a - b);
}

export async function renderMediaSeoDocumentsForTarget({
  fetchImpl = globalThis.fetch,
  siteOrigin = MEDIA_SITE_ORIGIN,
  target,
  token,
}) {
  if (target.mediaType === "movie") {
    const { en, vi } = await fetchMoviePair({ fetchImpl, tmdbId: target.tmdbId, token });
    const documents = buildMovieSeoDocuments({ en, siteOrigin, vi });
    return { documents: filterDocumentsForTarget(documents, target) };
  }

  const { en, vi } = await fetchTvPair({ fetchImpl, tmdbId: target.tmdbId, token });
  let enSeasons = [];
  let viSeasons = [];

  if (target.pageType === "season" || target.pageType === "episode") {
    const [enSeason, viSeason] = await Promise.all([
      fetchTmdbTvSeasonDetails({
        fetchImpl,
        language: TMDB_LANGUAGE_BY_LOCALE.en,
        seasonNumber: target.seasonNumber,
        tmdbId: target.tmdbId,
        token,
      }),
      fetchTmdbTvSeasonDetails({
        fetchImpl,
        language: TMDB_LANGUAGE_BY_LOCALE.vi,
        seasonNumber: target.seasonNumber,
        tmdbId: target.tmdbId,
        token,
      }),
    ]);

    if (enSeason === null && viSeason === null) {
      throw new MediaSeoNotFoundError("TV season not found.");
    }
    enSeasons = enSeason === null ? [] : [enSeason];
    viSeasons = viSeason === null ? [] : [viSeason];
  }

  const documents = buildTvSeoDocuments({
    enSeasons,
    enSeries: en,
    siteOrigin,
    viSeasons,
    viSeries: vi,
  });
  return { documents: filterDocumentsForTarget(documents, target) };
}

export function buildMovieSeoDocuments({ en, siteOrigin = MEDIA_SITE_ORIGIN, vi }) {
  assertRenderableMedia(en, "Movie not found.");
  if (en.adult === true || vi?.adult === true) {
    return [];
  }

  const mediaByLocale = {
    en: normalizeMovie(en, en, "en"),
    vi: normalizeMovie(vi ?? en, en, "vi"),
  };
  const targets = Object.fromEntries(
    MEDIA_LOCALES.map((locale) => [
      locale,
      {
        locale,
        mediaType: "movie",
        pageType: "movie",
        slug: mediaSeoSlugForTitle(en.id, mediaByLocale[locale].title),
        tmdbId: en.id,
      },
    ]),
  );
  const alternates = alternateUrls(siteOrigin, targets);

  return MEDIA_LOCALES.map((locale) =>
    buildMediaSeoDocument({
      alternates,
      canonicalTarget: targets[locale],
      jsonLd: movieJsonLd(mediaByLocale[locale], mediaSeoCanonicalUrl(siteOrigin, targets[locale])),
      locale,
      media: mediaByLocale[locale],
      pageKindLabel: locale === "vi" ? "Phim" : "Movie",
      pageType: "movie",
      siteOrigin,
      target: targets[locale],
    }),
  );
}

export function buildTvSeoDocuments({
  enSeasons = [],
  enSeries,
  siteOrigin = MEDIA_SITE_ORIGIN,
  viSeasons = [],
  viSeries,
}) {
  assertRenderableMedia(enSeries, "TV series not found.");
  if (enSeries.adult === true || viSeries?.adult === true) {
    return [];
  }

  const seriesByLocale = {
    en: normalizeTvSeries(enSeries, enSeries, "en"),
    vi: normalizeTvSeries(viSeries ?? enSeries, enSeries, "vi"),
  };
  const seriesTargets = Object.fromEntries(
    MEDIA_LOCALES.map((locale) => [
      locale,
      {
        locale,
        mediaType: "tv",
        pageType: "tv",
        slug: mediaSeoSlugForTitle(enSeries.id, seriesByLocale[locale].title),
        tmdbId: enSeries.id,
      },
    ]),
  );
  const seriesAlternates = alternateUrls(siteOrigin, seriesTargets);
  const documents = MEDIA_LOCALES.map((locale) =>
    buildMediaSeoDocument({
      alternates: seriesAlternates,
      canonicalTarget: seriesTargets[locale],
      jsonLd: tvSeriesJsonLd(
        seriesByLocale[locale],
        mediaSeoCanonicalUrl(siteOrigin, seriesTargets[locale]),
      ),
      locale,
      media: seriesByLocale[locale],
      pageKindLabel: locale === "vi" ? "Phim bo" : "TV series",
      pageType: "tv",
      siteOrigin,
      target: seriesTargets[locale],
    }),
  );

  const viSeasonsByNumber = new Map(
    viSeasons
      .map((season) => [toPositiveInteger(season?.season_number), season])
      .filter(([seasonNumber]) => seasonNumber !== null),
  );

  for (const enSeason of enSeasons) {
    const seasonNumber = toPositiveInteger(enSeason?.season_number);
    if (seasonNumber === null || seasonNumber === 0) {
      continue;
    }

    const viSeason = viSeasonsByNumber.get(seasonNumber) ?? null;
    const seasonByLocale = {
      en: normalizeTvSeason(enSeason, enSeason, seriesByLocale.en, "en"),
      vi: normalizeTvSeason(viSeason ?? enSeason, enSeason, seriesByLocale.vi, "vi"),
    };
    const seasonTargets = Object.fromEntries(
      MEDIA_LOCALES.map((locale) => [
        locale,
        {
          locale,
          mediaType: "tv",
          pageType: "season",
          seasonNumber,
          slug: seriesTargets[locale].slug,
          tmdbId: enSeries.id,
        },
      ]),
    );
    const seasonAlternates = alternateUrls(siteOrigin, seasonTargets);

    documents.push(
      ...MEDIA_LOCALES.map((locale) =>
        buildMediaSeoDocument({
          alternates: seasonAlternates,
          canonicalTarget: seasonTargets[locale],
          jsonLd: tvSeasonJsonLd({
            canonicalUrl: mediaSeoCanonicalUrl(siteOrigin, seasonTargets[locale]),
            season: seasonByLocale[locale],
            series: seriesByLocale[locale],
            seriesUrl: mediaSeoCanonicalUrl(siteOrigin, seriesTargets[locale]),
          }),
          locale,
          media: seasonByLocale[locale],
          pageKindLabel: locale === "vi" ? "Mua" : "Season",
          pageType: "season",
          siteOrigin,
          target: seasonTargets[locale],
        }),
      ),
    );

    const viEpisodesByNumber = new Map(
      (Array.isArray(viSeason?.episodes) ? viSeason.episodes : [])
        .map((episode) => [toPositiveInteger(episode?.episode_number), episode])
        .filter(([episodeNumber]) => episodeNumber !== null),
    );

    for (const enEpisode of Array.isArray(enSeason?.episodes) ? enSeason.episodes : []) {
      const episodeNumber = toPositiveInteger(enEpisode?.episode_number);
      if (episodeNumber === null) {
        continue;
      }

      const viEpisode = viEpisodesByNumber.get(episodeNumber) ?? null;
      const episodeByLocale = {
        en: normalizeTvEpisode(enEpisode, enEpisode, seasonByLocale.en, seriesByLocale.en, "en"),
        vi: normalizeTvEpisode(
          viEpisode ?? enEpisode,
          enEpisode,
          seasonByLocale.vi,
          seriesByLocale.vi,
          "vi",
        ),
      };
      const episodeTargets = Object.fromEntries(
        MEDIA_LOCALES.map((locale) => [
          locale,
          {
            episodeNumber,
            locale,
            mediaType: "tv",
            pageType: "episode",
            seasonNumber,
            slug: seriesTargets[locale].slug,
            tmdbId: enSeries.id,
          },
        ]),
      );
      const episodeAlternates = alternateUrls(siteOrigin, episodeTargets);

      documents.push(
        ...MEDIA_LOCALES.map((locale) =>
          buildMediaSeoDocument({
            alternates: episodeAlternates,
            canonicalTarget: episodeTargets[locale],
            jsonLd: tvEpisodeJsonLd({
              canonicalUrl: mediaSeoCanonicalUrl(siteOrigin, episodeTargets[locale]),
              episode: episodeByLocale[locale],
              season: seasonByLocale[locale],
              seasonUrl: mediaSeoCanonicalUrl(siteOrigin, seasonTargets[locale]),
              series: seriesByLocale[locale],
              seriesUrl: mediaSeoCanonicalUrl(siteOrigin, seriesTargets[locale]),
            }),
            locale,
            media: episodeByLocale[locale],
            pageKindLabel: locale === "vi" ? "Tap" : "Episode",
            pageType: "episode",
            siteOrigin,
            target: episodeTargets[locale],
          }),
        ),
      );
    }
  }

  return documents;
}

export function buildSitemapDocuments(
  records,
  { chunkSize = MEDIA_SEO_SITEMAP_CHUNK_SIZE, siteOrigin = MEDIA_SITE_ORIGIN } = {},
) {
  const normalizedRecords = records
    .map((record) => ({
      key: record.key,
      lastmod: record.lastmod,
      locale: record.locale,
      url: absoluteUrl(siteOrigin, record.publicPath ?? record.url ?? ""),
    }))
    .filter((record) => MEDIA_LOCALES.includes(record.locale) && record.url.startsWith("https://"))
    .sort((a, b) => a.locale.localeCompare(b.locale) || a.url.localeCompare(b.url));

  const documents = [];
  const sitemapEntries = [];

  for (const locale of MEDIA_LOCALES) {
    const localeRecords = normalizedRecords.filter((record) => record.locale === locale);
    const chunkCount = Math.max(1, Math.ceil(localeRecords.length / chunkSize));

    for (let chunkIndex = 1; chunkIndex <= chunkCount; chunkIndex += 1) {
      const chunkRecords = localeRecords.slice(
        (chunkIndex - 1) * chunkSize,
        chunkIndex * chunkSize,
      );
      const key = mediaSeoSitemapChunkKey(locale, chunkIndex);
      const publicPath = mediaSeoSitemapChunkPublicPath(locale, chunkIndex);
      const url = absoluteUrl(siteOrigin, publicPath);
      const body = sitemapUrlSet(chunkRecords);

      documents.push({ body, contentType: "application/xml;charset=utf-8", key, publicPath });
      sitemapEntries.push({ lastmod: latestLastmod(chunkRecords), url });
    }
  }

  documents.unshift({
    body: sitemapIndex(sitemapEntries),
    contentType: "application/xml;charset=utf-8",
    key: MEDIA_SEO_SITEMAP_INDEX_KEY,
    publicPath: MEDIA_SEO_SITEMAP_PUBLIC_PATH,
  });

  return documents;
}

function buildMediaSeoDocument({
  alternates,
  canonicalTarget,
  jsonLd,
  locale,
  media,
  pageKindLabel,
  pageType,
  siteOrigin,
  target,
}) {
  const canonicalUrl = mediaSeoCanonicalUrl(siteOrigin, canonicalTarget);
  const pageTitle = `${media.title} | ${pageKindLabel} | ${MEDIA_SITE_NAME}`;
  const image = media.backdropUrl ?? media.posterUrl ?? null;
  const headMetadata = renderHeadMetadata({
    alternates,
    canonicalUrl,
    description: media.description,
    image,
    pageTitle,
    pageType,
    title: media.title,
  });
  const visibleBody = renderVisibleBody({ media, pageKindLabel });
  const tmdbAttribution = renderTmdbAttribution();
  const html = renderTemplate(MEDIA_SEO_HTML_TEMPLATE, {
    headMetadata,
    jsonLd: `    <script type="application/ld+json">${jsonLdScript(jsonLd)}</script>`,
    lang: locale,
    styles: MEDIA_SEO_STYLES,
    tmdbAttribution,
    visibleBody,
  });

  return {
    html,
    key: mediaSeoR2KeyForTarget(target),
    locale,
    mediaType: target.mediaType,
    pageType,
    publicPath: mediaSeoPublicPath(target),
    tmdbId: target.tmdbId,
    seasonNumber: target.seasonNumber,
    episodeNumber: target.episodeNumber,
  };
}

function renderHeadMetadata({
  alternates,
  canonicalUrl,
  description,
  image,
  pageTitle,
  pageType,
  title,
}) {
  const alternateLinks = Object.entries(alternates)
    .map(
      ([locale, url]) =>
        `    <link rel="alternate" hreflang="${escapeHtml(locale)}" href="${escapeHtml(url)}" />`,
    )
    .join("\n");
  const xDefault = alternates.en
    ? `\n    <link rel="alternate" hreflang="x-default" href="${escapeHtml(alternates.en)}" />`
    : "";
  const imageMeta =
    image === null
      ? ""
      : `\n    <meta property="og:image" content="${escapeHtml(image)}" />\n    <meta name="twitter:image" content="${escapeHtml(image)}" />`;

  return `    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="x-daopk-seo-asset" content="media-${escapeHtml(pageType)}" />
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
${alternateLinks}${xDefault}
    <meta property="og:type" content="${pageType === "movie" ? "video.movie" : "website"}" />
    <meta property="og:site_name" content="${escapeHtml(MEDIA_SITE_NAME)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />${imageMeta}
    <meta name="twitter:card" content="${image === null ? "summary" : "summary_large_image"}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />`;
}

function renderVisibleBody({ media, pageKindLabel }) {
  const backdrop = media.backdropUrl ?? media.posterUrl;
  const backdropHtml =
    backdrop === null
      ? ""
      : `<img class="media-hero__backdrop" src="${escapeHtml(backdrop)}" alt="" loading="eager" />`;
  const posterHtml =
    media.posterUrl === null
      ? `<div class="media-poster" aria-hidden="true"></div>`
      : `<img class="media-poster" src="${escapeHtml(media.posterUrl)}" alt="${escapeHtml(
          `${media.title} poster`,
        )}" loading="eager" />`;
  const metaHtml = media.meta
    .filter((value) => value.length > 0)
    .map((value) => `<span>${escapeHtml(value)}</span>`)
    .join("");

  return `    <main class="media-page">
      <article>
        <section class="media-hero">
          ${backdropHtml}
          <div class="media-hero__content">
            ${posterHtml}
            <div>
              <p class="media-kicker">${escapeHtml(pageKindLabel)}</p>
              <h1>${escapeHtml(media.title)}</h1>
              <div class="media-meta">${metaHtml}</div>
            </div>
          </div>
        </section>
        <section class="media-overview">
          <h2>${escapeHtml(media.overviewLabel)}</h2>
          <p>${escapeHtml(media.description)}</p>
        </section>
      </article>
    </main>`;
}

function renderTmdbAttribution() {
  return `    <p class="media-attribution">This product uses the TMDB API but is not endorsed or certified by TMDB. Metadata and imagery are provided by The Movie Database.</p>`;
}

function renderTemplate(template, slots) {
  return template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, slotName) => {
    if (!Object.prototype.hasOwnProperty.call(slots, slotName)) {
      throw new MediaSeoError(`Missing media SEO template slot: ${slotName}`);
    }
    return slots[slotName];
  });
}

function normalizeMovie(movie, fallback, locale) {
  const title = firstText(
    movie?.title,
    movie?.original_title,
    fallback?.title,
    fallback?.original_title,
  );
  const overview = firstText(movie?.overview, fallback?.overview);
  const releaseYear = yearFromDate(firstText(movie?.release_date, fallback?.release_date));
  const runtime = toPositiveInteger(movie?.runtime) ?? toPositiveInteger(fallback?.runtime);
  const genres = localizedGenres(movie?.genres, fallback?.genres);

  return {
    datePublished: firstText(movie?.release_date, fallback?.release_date),
    description: overview || fallbackDescription(title, locale),
    genres,
    imageUrl: imageUrl(firstText(movie?.poster_path, fallback?.poster_path), "w500"),
    meta: [releaseYear, runtime === null ? "" : `${runtime} min`, genres.join(", ")],
    overviewLabel: locale === "vi" ? "Tom tat" : "Overview",
    posterUrl: imageUrl(firstText(movie?.poster_path, fallback?.poster_path), "w500"),
    backdropUrl: imageUrl(firstText(movie?.backdrop_path, fallback?.backdrop_path), "w1280"),
    runtime,
    title,
  };
}

function normalizeTvSeries(series, fallback, locale) {
  const title = firstText(
    series?.name,
    series?.original_name,
    fallback?.name,
    fallback?.original_name,
  );
  const overview = firstText(series?.overview, fallback?.overview);
  const firstAirYear = yearFromDate(firstText(series?.first_air_date, fallback?.first_air_date));
  const genres = localizedGenres(series?.genres, fallback?.genres);
  const seasons =
    toPositiveInteger(series?.number_of_seasons) ?? toPositiveInteger(fallback?.number_of_seasons);
  const episodes =
    toPositiveInteger(series?.number_of_episodes) ??
    toPositiveInteger(fallback?.number_of_episodes);

  return {
    datePublished: firstText(series?.first_air_date, fallback?.first_air_date),
    description: overview || fallbackDescription(title, locale),
    episodes,
    genres,
    meta: [
      firstAirYear,
      seasons === null ? "" : `${seasons} season${seasons === 1 ? "" : "s"}`,
      episodes === null ? "" : `${episodes} episode${episodes === 1 ? "" : "s"}`,
      genres.join(", "),
    ],
    numberOfSeasons: seasons,
    overviewLabel: locale === "vi" ? "Tom tat" : "Overview",
    posterUrl: imageUrl(firstText(series?.poster_path, fallback?.poster_path), "w500"),
    backdropUrl: imageUrl(firstText(series?.backdrop_path, fallback?.backdrop_path), "w1280"),
    title,
  };
}

function normalizeTvSeason(season, fallback, series, locale) {
  const seasonNumber =
    toPositiveInteger(season?.season_number) ?? toPositiveInteger(fallback?.season_number);
  const defaultTitle = seasonNumber === null ? "Season" : `Season ${seasonNumber}`;
  const title = firstText(season?.name, fallback?.name, defaultTitle);
  const overview = firstText(season?.overview, fallback?.overview);
  const airYear = yearFromDate(firstText(season?.air_date, fallback?.air_date));
  const episodeCount = Array.isArray(season?.episodes)
    ? season.episodes.length
    : Array.isArray(fallback?.episodes)
      ? fallback.episodes.length
      : null;

  return {
    datePublished: firstText(season?.air_date, fallback?.air_date),
    description: overview || fallbackDescription(`${series.title}: ${title}`, locale),
    meta: [
      series.title,
      airYear,
      episodeCount === null ? "" : `${episodeCount} episode${episodeCount === 1 ? "" : "s"}`,
    ],
    overviewLabel: locale === "vi" ? "Tom tat" : "Overview",
    posterUrl: imageUrl(
      firstText(season?.poster_path, fallback?.poster_path, series.posterUrl),
      "w500",
    ),
    backdropUrl: series.backdropUrl,
    seasonNumber,
    title: `${series.title}: ${title}`,
  };
}

function normalizeTvEpisode(episode, fallback, season, series, locale) {
  const episodeNumber =
    toPositiveInteger(episode?.episode_number) ?? toPositiveInteger(fallback?.episode_number);
  const defaultTitle = episodeNumber === null ? "Episode" : `Episode ${episodeNumber}`;
  const title = firstText(episode?.name, fallback?.name, defaultTitle);
  const overview = firstText(episode?.overview, fallback?.overview);
  const airDate = firstText(episode?.air_date, fallback?.air_date);

  return {
    datePublished: airDate,
    description: overview || fallbackDescription(`${series.title}: ${title}`, locale),
    meta: [series.title, season.title.replace(`${series.title}: `, ""), airDate],
    overviewLabel: locale === "vi" ? "Tom tat" : "Overview",
    posterUrl: imageUrl(
      firstText(episode?.still_path, fallback?.still_path, season.posterUrl),
      "w780",
    ),
    backdropUrl:
      imageUrl(firstText(episode?.still_path, fallback?.still_path), "w1280") ?? series.backdropUrl,
    episodeNumber,
    title: `${series.title}: ${title}`,
  };
}

function movieJsonLd(media, canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "Movie",
    datePublished: media.datePublished || undefined,
    description: media.description,
    duration: media.runtime === null ? undefined : `PT${media.runtime}M`,
    genre: media.genres.length === 0 ? undefined : media.genres,
    image: media.posterUrl ?? media.backdropUrl ?? undefined,
    mainEntityOfPage: canonicalUrl,
    name: media.title,
    url: canonicalUrl,
  };
}

function tvSeriesJsonLd(media, canonicalUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    datePublished: media.datePublished || undefined,
    description: media.description,
    genre: media.genres.length === 0 ? undefined : media.genres,
    image: media.posterUrl ?? media.backdropUrl ?? undefined,
    mainEntityOfPage: canonicalUrl,
    name: media.title,
    numberOfEpisodes: media.episodes ?? undefined,
    numberOfSeasons: media.numberOfSeasons ?? undefined,
    url: canonicalUrl,
  };
}

function tvSeasonJsonLd({ canonicalUrl, season, series, seriesUrl }) {
  return {
    "@context": "https://schema.org",
    "@type": "TVSeason",
    datePublished: season.datePublished || undefined,
    description: season.description,
    image: season.posterUrl ?? season.backdropUrl ?? undefined,
    mainEntityOfPage: canonicalUrl,
    name: season.title,
    partOfSeries: {
      "@type": "TVSeries",
      name: series.title,
      url: seriesUrl,
    },
    seasonNumber: season.seasonNumber ?? undefined,
    url: canonicalUrl,
  };
}

function tvEpisodeJsonLd({ canonicalUrl, episode, season, seasonUrl, series, seriesUrl }) {
  return {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    datePublished: episode.datePublished || undefined,
    description: episode.description,
    episodeNumber: episode.episodeNumber ?? undefined,
    image: episode.posterUrl ?? episode.backdropUrl ?? undefined,
    mainEntityOfPage: canonicalUrl,
    name: episode.title,
    partOfSeason: {
      "@type": "TVSeason",
      name: season.title,
      seasonNumber: season.seasonNumber ?? undefined,
      url: seasonUrl,
    },
    partOfSeries: {
      "@type": "TVSeries",
      name: series.title,
      url: seriesUrl,
    },
    url: canonicalUrl,
  };
}

function cleanJsonLd(value) {
  if (Array.isArray(value)) {
    const array = value.map(cleanJsonLd).filter((entry) => entry !== undefined);
    return array.length === 0 ? undefined : array;
  }
  if (value !== null && typeof value === "object") {
    const object = {};
    for (const [key, entryValue] of Object.entries(value)) {
      const cleaned = cleanJsonLd(entryValue);
      if (cleaned !== undefined) {
        object[key] = cleaned;
      }
    }
    return Object.keys(object).length === 0 ? undefined : object;
  }
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return value;
}

async function fetchMoviePair({ fetchImpl, tmdbId, token }) {
  const [en, vi] = await Promise.all([
    fetchTmdbMovieDetails({ fetchImpl, language: TMDB_LANGUAGE_BY_LOCALE.en, tmdbId, token }),
    fetchTmdbMovieDetails({ fetchImpl, language: TMDB_LANGUAGE_BY_LOCALE.vi, tmdbId, token }),
  ]);
  if (en === null && vi === null) {
    throw new MediaSeoNotFoundError("Movie not found.");
  }
  return { en: en ?? vi, vi: vi ?? en };
}

async function fetchTvPair({ fetchImpl, tmdbId, token }) {
  const [en, vi] = await Promise.all([
    fetchTmdbTvDetails({ fetchImpl, language: TMDB_LANGUAGE_BY_LOCALE.en, tmdbId, token }),
    fetchTmdbTvDetails({ fetchImpl, language: TMDB_LANGUAGE_BY_LOCALE.vi, tmdbId, token }),
  ]);
  if (en === null && vi === null) {
    throw new MediaSeoNotFoundError("TV series not found.");
  }
  return { en: en ?? vi, vi: vi ?? en };
}

function filterDocumentsForTarget(documents, target) {
  return documents.filter((document) => {
    if (target.locale !== undefined && document.locale !== target.locale) return false;
    if (document.mediaType !== target.mediaType) return false;
    if (document.pageType !== target.pageType) return false;
    if (document.tmdbId !== target.tmdbId) return false;
    if (target.seasonNumber !== undefined && document.seasonNumber !== target.seasonNumber) {
      return false;
    }
    if (target.episodeNumber !== undefined && document.episodeNumber !== target.episodeNumber) {
      return false;
    }
    return true;
  });
}

function alternateUrls(siteOrigin, targets) {
  return Object.fromEntries(
    Object.entries(targets).map(([locale, target]) => [
      locale,
      mediaSeoCanonicalUrl(siteOrigin, target),
    ]),
  );
}

function assertRenderableMedia(value, message) {
  if (value === null || value === undefined) {
    throw new MediaSeoNotFoundError(message);
  }
  const id = toPositiveInteger(value.id);
  if (id === null) {
    throw new MediaSeoNotFoundError(message);
  }
}

function parseIdSlug(value) {
  const match = ID_SLUG_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  return { slug: match[2], tmdbId: Number(match[1]) };
}

function isPositiveIntegerString(value) {
  return typeof value === "string" && POSITIVE_INTEGER_PATTERN.test(value);
}

function toPositiveInteger(value) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isInteger(number) && number > 0 ? number : null;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "";
}

function localizedGenres(localizedGenresValue, fallbackGenresValue) {
  const localized = genresFromValue(localizedGenresValue);
  return localized.length === 0 ? genresFromValue(fallbackGenresValue) : localized;
}

function genresFromValue(value) {
  return Array.isArray(value)
    ? value.map((genre) => firstText(genre?.name)).filter((name) => name.length > 0)
    : [];
}

function fallbackDescription(title, locale) {
  return locale === "vi"
    ? `Thong tin ve ${title}, duoc cung cap boi TMDB.`
    : `Details for ${title}, powered by TMDB.`;
}

function imageUrl(path, size) {
  if (typeof path !== "string") {
    return null;
  }
  if (path.startsWith("https://")) {
    return path;
  }
  if (!TMDB_IMAGE_PATH_PATTERN.test(path)) {
    return null;
  }
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

function yearFromDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 4) : "";
}

function normalizeSearchResult(result, requestedType) {
  const mediaType = requestedType === "multi" ? result?.media_type : requestedType;
  if (mediaType !== "movie" && mediaType !== "tv") {
    return null;
  }
  if (result?.adult === true) {
    return null;
  }

  const id = toPositiveInteger(result?.id);
  if (id === null) {
    return null;
  }

  const title =
    mediaType === "movie"
      ? firstText(result?.title, result?.original_title)
      : firstText(result?.name, result?.original_name);
  if (title.length === 0) {
    return null;
  }

  return {
    backdropUrl: imageUrl(result?.backdrop_path, "w780"),
    id,
    mediaType,
    overview: firstText(result?.overview),
    posterUrl: imageUrl(result?.poster_path, "w342"),
    releaseDate:
      mediaType === "movie" ? firstText(result?.release_date) : firstText(result?.first_air_date),
    title,
  };
}

function sitemapUrlSet(records) {
  const urls = records
    .map((record) => {
      const lastmod = validDate(record.lastmod) ?? null;
      return `  <url>
    <loc>${escapeHtml(record.url)}</loc>${lastmod === null ? "" : `\n    <lastmod>${escapeHtml(lastmod)}</lastmod>`}
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function sitemapIndex(entries) {
  const sitemaps = entries
    .map((entry) => {
      const lastmod = validDate(entry.lastmod) ?? null;
      return `  <sitemap>
    <loc>${escapeHtml(entry.url)}</loc>${lastmod === null ? "" : `\n    <lastmod>${escapeHtml(lastmod)}</lastmod>`}
  </sitemap>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps}
</sitemapindex>
`;
}

function latestLastmod(records) {
  const dates = records
    .map((record) => validDate(record.lastmod))
    .filter(Boolean)
    .sort();
  return dates.at(-1) ?? null;
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function absoluteUrl(siteOrigin, pathOrUrl) {
  if (pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  return `${trimTrailingSlash(siteOrigin)}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}
