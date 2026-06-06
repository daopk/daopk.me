export const MEDIA_SITE_ORIGIN: "https://daopk.me";
export const MEDIA_SITE_NAME: "daopk.me";
export const MEDIA_SEO_BUCKET: "daopk-movies";
export const MEDIA_SEO_STATE_KEY: "state/media-seo-state.json";
export const MEDIA_SEO_INVENTORY_KEY: "state/page-inventory.ndjson.gz";
export const MEDIA_SEO_PENDING_PREFIX: "pending/on-demand";
export const MEDIA_SEO_MANIFEST_PREFIX: "manifests";
export const MEDIA_SEO_SITEMAP_INDEX_KEY: "sitemaps/media-index.xml";
export const MEDIA_SEO_SITEMAP_PUBLIC_PATH: "/sitemap-media.xml";
export const MEDIA_SEO_SITEMAP_CHUNK_SIZE: 45000;
export const TMDB_API_BASE_URL: "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE_URL: "https://image.tmdb.org/t/p";
export const MEDIA_LOCALES: readonly ["en", "vi"];
export const TMDB_LANGUAGE_BY_LOCALE: {
  readonly en: "en-US";
  readonly vi: "vi-VN";
};
export const MEDIA_SEO_HTML_TEMPLATE: string;

export type MediaLocale = "en" | "vi";
export type MediaType = "movie" | "tv";
export type MediaPageType = "movie" | "tv" | "season" | "episode";

export interface MediaSeoRoute {
  readonly episodeNumber?: number;
  readonly locale: MediaLocale;
  readonly mediaType: MediaType;
  readonly pageType: MediaPageType;
  readonly seasonNumber?: number;
  readonly slug: string;
  readonly tmdbId: number;
}

export interface MediaSeoEnsureTarget {
  readonly episodeNumber?: number;
  readonly mediaType: MediaType;
  readonly pageType: MediaPageType;
  readonly seasonNumber?: number;
  readonly tmdbId: number;
}

export interface MediaSeoDocument {
  readonly episodeNumber?: number;
  readonly html: string;
  readonly key: string;
  readonly locale: MediaLocale;
  readonly mediaType: MediaType;
  readonly pageType: MediaPageType;
  readonly publicPath: string;
  readonly seasonNumber?: number;
  readonly tmdbId: number;
}

export interface MediaSeoSitemapRecord {
  readonly key?: string;
  readonly lastmod?: string | null;
  readonly locale: MediaLocale;
  readonly publicPath?: string;
  readonly url?: string;
}

export interface MediaSeoSitemapDocument {
  readonly body: string;
  readonly contentType: "application/xml;charset=utf-8";
  readonly key: string;
  readonly publicPath: string;
}

export interface MediaSearchParams {
  readonly language: "en-US" | "vi-VN";
  readonly page: number;
  readonly query: string;
  readonly type: "multi" | "movie" | "tv";
}

export class MediaSeoError extends Error {
  readonly status: number;
  constructor(message: string, status?: number);
}

export class MediaSeoNotFoundError extends MediaSeoError {
  constructor(message?: string);
}

export function escapeHtml(value: unknown): string;
export function jsonLdScript(value: unknown): string;
export function slugifyMediaTitle(value: unknown, fallback?: string): string;
export function mediaSeoSlugForTitle(tmdbId: number, title: unknown): string;
export function parseMediaSeoRoute(pathname: string): MediaSeoRoute | null;
export function mediaSeoPublicPath(
  target:
    | MediaSeoRoute
    | (MediaSeoEnsureTarget & { readonly locale: MediaLocale; readonly slug: string }),
): string;
export function mediaSeoR2KeyForTarget(
  target:
    | MediaSeoRoute
    | (MediaSeoEnsureTarget & { readonly locale: MediaLocale; readonly slug: string }),
): string;
export function mediaSeoR2KeyForRoute(route: MediaSeoRoute): string;
export function mediaSeoCanonicalUrl(siteOrigin: string, target: MediaSeoRoute): string;
export function mediaSeoSitemapChunkKey(locale: MediaLocale, chunkIndex: number): string;
export function mediaSeoSitemapChunkPublicPath(locale: MediaLocale, chunkIndex: number): string;
export function mediaSeoSitemapKeyForPublicPath(pathname: string): string | null;
export function pendingOnDemandKey(payload: {
  readonly mediaType: MediaType;
  readonly tmdbId: number;
}): string;
export function normalizeEnsurePayload(value: unknown): MediaSeoEnsureTarget;
export function validateMediaSearchParams(searchParams: URLSearchParams): MediaSearchParams;
export function searchTmdbMedia(options: {
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly language?: "en-US" | "vi-VN";
  readonly page?: number;
  readonly query: string;
  readonly token?: string;
  readonly type?: "multi" | "movie" | "tv";
}): Promise<{
  readonly page: number;
  readonly results: readonly {
    readonly backdropUrl: string | null;
    readonly id: number;
    readonly mediaType: MediaType;
    readonly overview: string;
    readonly posterUrl: string | null;
    readonly releaseDate: string;
    readonly title: string;
  }[];
  readonly totalPages: number;
  readonly totalResults: number;
}>;
export function tmdbFetchJson(options: {
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly params?: Record<string, unknown>;
  readonly path: string;
  readonly token?: string;
}): Promise<any>;
export function fetchTmdbMovieDetails(options: {
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly language: string;
  readonly tmdbId: number;
  readonly token?: string;
}): Promise<any>;
export function fetchTmdbTvDetails(options: {
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly language: string;
  readonly tmdbId: number;
  readonly token?: string;
}): Promise<any>;
export function fetchTmdbTvSeasonDetails(options: {
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly language: string;
  readonly seasonNumber: number;
  readonly tmdbId: number;
  readonly token?: string;
}): Promise<any>;
export function fetchTmdbChangedIds(options: {
  readonly endDate: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly log?: (message: string) => void;
  readonly mediaType: MediaType;
  readonly startDate: string;
  readonly token?: string;
}): Promise<number[]>;
export function renderMediaSeoDocumentsForTarget(options: {
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly siteOrigin?: string;
  readonly target: MediaSeoRoute | MediaSeoEnsureTarget;
  readonly token?: string;
}): Promise<{ readonly documents: readonly MediaSeoDocument[] }>;
export function buildMovieSeoDocuments(options: {
  readonly en: any;
  readonly siteOrigin?: string;
  readonly vi?: any;
}): MediaSeoDocument[];
export function buildTvSeoDocuments(options: {
  readonly enSeasons?: readonly any[];
  readonly enSeries: any;
  readonly siteOrigin?: string;
  readonly viSeasons?: readonly any[];
  readonly viSeries?: any;
}): MediaSeoDocument[];
export function buildSitemapDocuments(
  records: readonly MediaSeoSitemapRecord[],
  options?: {
    readonly chunkSize?: number;
    readonly siteOrigin?: string;
  },
): MediaSeoSitemapDocument[];
