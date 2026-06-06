#!/usr/bin/env node
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  MEDIA_SEO_BUCKET,
  MEDIA_SEO_INVENTORY_KEY,
  MEDIA_SEO_MANIFEST_PREFIX,
  MEDIA_SEO_PENDING_PREFIX,
  MEDIA_SEO_STATE_KEY,
  MEDIA_SITE_ORIGIN,
  TMDB_LANGUAGE_BY_LOCALE,
  buildMovieSeoDocuments,
  buildSitemapDocuments,
  buildTvSeoDocuments,
  fetchTmdbChangedIds,
  fetchTmdbMovieDetails,
  fetchTmdbTvDetails,
  fetchTmdbTvSeasonDetails,
  normalizeEnsurePayload,
} from "./lib/mediaSeo.mjs";

const ROOT = process.cwd();
const DEFAULT_OUT_DIR = join(ROOT, "media-dist");
const S3_REGION = "auto";
const S3_SERVICE = "s3";
const EMPTY_SHA256 = sha256Hex(new Uint8Array());
const noopLog = () => undefined;

export function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return utcDateString(date);
}

export function mediaSeoChangeWindow(state = {}, now = new Date()) {
  const endDate = utcDateString(now);
  const previousEndDate = validDate(state.lastSuccessfulEndDate)
    ? state.lastSuccessfulEndDate
    : null;
  const uncappedStartDate =
    previousEndDate === null ? addUtcDays(endDate, -1) : addUtcDays(previousEndDate, -1);
  const earliestStartDate = addUtcDays(endDate, -13);
  const startDate = uncappedStartDate < earliestStartDate ? earliestStartDate : uncappedStartDate;

  return { endDate, startDate };
}

export function createThrottledLog(
  write,
  {
    clearTimer = globalThis.clearTimeout,
    intervalMs = 10_000,
    now = () => Date.now(),
    setTimer = globalThis.setTimeout,
  } = {},
) {
  let lastWriteAt = null;
  let pendingMessage = null;
  let timer = null;

  function clearScheduledFlush() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function writeNow(message) {
    write(message);
    lastWriteAt = now();
  }

  function scheduleFlush() {
    if (timer !== null || pendingMessage === null || lastWriteAt === null || intervalMs <= 0) {
      return;
    }

    const waitMs = Math.max(0, intervalMs - (now() - lastWriteAt));
    timer = setTimer(() => {
      timer = null;
      if (pendingMessage !== null) {
        const message = pendingMessage;
        pendingMessage = null;
        writeNow(message);
      }
    }, waitMs);
    timer?.unref?.();
  }

  function log(message) {
    if (intervalMs <= 0) {
      write(message);
      return;
    }

    const currentTime = now();
    if (lastWriteAt === null || currentTime - lastWriteAt >= intervalMs) {
      clearScheduledFlush();
      pendingMessage = null;
      writeNow(message);
      return;
    }

    pendingMessage = message;
    scheduleFlush();
  }

  log.flush = () => {
    clearScheduledFlush();
    if (pendingMessage !== null) {
      const message = pendingMessage;
      pendingMessage = null;
      writeNow(message);
    }
  };

  return log;
}

export function createR2S3Client({
  accessKeyId,
  accountId,
  bucket = MEDIA_SEO_BUCKET,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  secretAccessKey,
}) {
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 account id, access key id, and secret access key are required.");
  }

  const host = `${accountId}.r2.cloudflarestorage.com`;

  async function request(method, key = "", { body, contentType, query = {} } = {}) {
    const bytes = body === undefined ? undefined : toBytes(body);
    const payloadHash = bytes === undefined ? EMPTY_SHA256 : sha256Hex(bytes);
    const amzDate = amzDateString(now());
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = `/${awsEncode(bucket)}${key.length === 0 ? "" : `/${key.split("/").map(awsEncode).join("/")}`}`;
    const canonicalQueryString = canonicalQuery(query);
    const url = `https://${host}${canonicalUri}${
      canonicalQueryString.length === 0 ? "" : `?${canonicalQueryString}`
    }`;
    const headers = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };

    if (contentType !== undefined) {
      headers["content-type"] = contentType;
    }

    const signedHeaderNames = Object.keys(headers)
      .map((header) => header.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderNames
      .map((header) => `${header}:${headers[header].trim()}\n`)
      .join("");
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/${S3_REGION}/${S3_SERVICE}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const signingKey = signatureKey(secretAccessKey, dateStamp, S3_REGION, S3_SERVICE);
    const signature = hmacHex(signingKey, stringToSign);
    const requestHeaders = {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };

    return fetchImpl(url, {
      body: bytes,
      headers: requestHeaders,
      method,
    });
  }

  return {
    async deleteObject(key) {
      const response = await request("DELETE", key);
      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete R2 object ${key}: ${response.status}`);
      }
    },
    async getBytes(key) {
      const response = await request("GET", key);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to read R2 object ${key}: ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    async getText(key) {
      const bytes = await this.getBytes(key);
      return bytes === null ? null : new TextDecoder().decode(bytes);
    },
    async listKeys(prefix) {
      const keys = [];
      let continuationToken;

      do {
        const response = await request("GET", "", {
          query: {
            "continuation-token": continuationToken,
            "list-type": "2",
            prefix,
          },
        });
        if (!response.ok) {
          throw new Error(`Failed to list R2 prefix ${prefix}: ${response.status}`);
        }

        const xml = await response.text();
        keys.push(...parseListBucketKeys(xml));
        continuationToken = parseXmlTag(xml, "NextContinuationToken");
      } while (continuationToken !== null);

      return keys;
    },
    async putObject(key, body, contentType) {
      const response = await request("PUT", key, { body, contentType });
      if (!response.ok) {
        throw new Error(`Failed to upload R2 object ${key}: ${response.status}`);
      }
    },
  };
}

export function createFixtureFetch(fixturesDir) {
  return async function fixtureFetch(input) {
    const url = new URL(String(input));
    const path = fixturePathForTmdbUrl(fixturesDir, url);

    try {
      const body = await readFile(path, "utf8");
      return new Response(body, {
        headers: { "Content-Type": "application/json;charset=utf-8" },
        status: 200,
      });
    } catch {
      return new Response(JSON.stringify({ status_message: "Fixture not found." }), {
        headers: { "Content-Type": "application/json;charset=utf-8" },
        status: 404,
      });
    }
  };
}

export async function buildMediaSeoBundle({
  fetchImpl = globalThis.fetch,
  log = noopLog,
  movieIds,
  now = new Date(),
  outDir = DEFAULT_OUT_DIR,
  r2Client = null,
  siteOrigin = MEDIA_SITE_ORIGIN,
  tmdbToken,
  tvIds,
  upload = false,
} = {}) {
  log("starting media SEO refresh");
  if (r2Client === null) {
    log("running without R2 state (dry run or local fixture mode)");
  } else {
    log(`reading R2 state: ${MEDIA_SEO_STATE_KEY}`);
  }

  const state = r2Client === null ? {} : await readJsonObject(r2Client, MEDIA_SEO_STATE_KEY, {});
  const window = mediaSeoChangeWindow(state, now);
  log(`change window: ${window.startDate} -> ${window.endDate}`);
  if (r2Client !== null) {
    log(`reading pending queue: ${MEDIA_SEO_PENDING_PREFIX}/`);
  }
  const pending = r2Client === null ? [] : await readPendingRequests(r2Client);
  log(`pending queue: ${pending.length} request(s)`);
  const pendingMovieIds = pending
    .filter((request) => request.mediaType === "movie")
    .map((request) => request.tmdbId);
  const pendingTvIds = pending
    .filter((request) => request.mediaType === "tv")
    .map((request) => request.tmdbId);

  const [changedMovieIds, changedTvIds] =
    movieIds !== undefined || tvIds !== undefined
      ? (() => {
          log(
            `using manual IDs: ${movieIds?.length ?? 0} movie(s), ${tvIds?.length ?? 0} TV series`,
          );
          return [movieIds ?? [], tvIds ?? []];
        })()
      : await (async () => {
          log("fetching TMDB changed IDs for movies and TV");
          const changedIds = await Promise.all([
            fetchTmdbChangedIds({
              endDate: window.endDate,
              fetchImpl,
              log,
              mediaType: "movie",
              startDate: window.startDate,
              token: tmdbToken,
            }),
            fetchTmdbChangedIds({
              endDate: window.endDate,
              fetchImpl,
              log,
              mediaType: "tv",
              startDate: window.startDate,
              token: tmdbToken,
            }),
          ]);
          log(
            `TMDB changed IDs: ${changedIds[0].length} movie(s), ${changedIds[1].length} TV series`,
          );
          return changedIds;
        })();

  const allMovieIds = uniqueSortedPositiveIntegers([...changedMovieIds, ...pendingMovieIds]);
  const allTvIds = uniqueSortedPositiveIntegers([...changedTvIds, ...pendingTvIds]);
  const documentRecords = [];
  const lastmod = utcDateString(now);
  const failures = [];
  const skipped = [];
  let documentCount = 0;
  let uploadSummary = { skipped: 0, uploaded: 0 };

  log(`resetting output directory: ${outDir}`);
  await resetOutputDir(outDir);

  log(
    `movies to process: ${allMovieIds.length} total (${changedMovieIds.length} changed, ${pendingMovieIds.length} pending)`,
  );
  for (const [index, tmdbId] of allMovieIds.entries()) {
    const progress = `movie ${index + 1}/${allMovieIds.length}`;
    log(`${progress}: TMDB ${tmdbId}`);
    try {
      const movieDocuments = await renderMovieDocuments({
        fetchImpl,
        siteOrigin,
        tmdbId,
        tmdbToken,
      });
      documentCount += movieDocuments.length;
      documentRecords.push(...movieDocuments.map((document) => inventoryRecord(document, lastmod)));
      await writeOutputObjects(outDir, movieDocuments.map(htmlDocumentOutput));
      log(`${progress}: rendered ${movieDocuments.length} page(s)`);
      uploadSummary = mergeUploadSummary(
        uploadSummary,
        await flushHtmlDocuments({
          documents: movieDocuments,
          log,
          progress,
          r2Client,
          upload,
        }),
      );
    } catch (error) {
      if (isNotFoundLike(error)) {
        skipped.push({ mediaType: "movie", reason: error.message, tmdbId });
        log(`${progress}: skipped (${error.message})`);
      } else {
        failures.push({ error: errorMessage(error), mediaType: "movie", tmdbId });
        log(`${progress}: failed (${errorMessage(error)})`);
      }
    }
  }

  log(
    `TV series to process: ${allTvIds.length} total (${changedTvIds.length} changed, ${pendingTvIds.length} pending)`,
  );
  for (const [index, tmdbId] of allTvIds.entries()) {
    const progress = `tv ${index + 1}/${allTvIds.length}`;
    log(`${progress}: TMDB ${tmdbId}`);
    try {
      const tvDocuments = await renderTvDocuments({
        fetchImpl,
        log,
        progress,
        siteOrigin,
        tmdbId,
        tmdbToken,
      });
      documentCount += tvDocuments.length;
      documentRecords.push(...tvDocuments.map((document) => inventoryRecord(document, lastmod)));
      await writeOutputObjects(outDir, tvDocuments.map(htmlDocumentOutput));
      log(`${progress}: rendered ${tvDocuments.length} page(s)`);
      uploadSummary = mergeUploadSummary(
        uploadSummary,
        await flushHtmlDocuments({
          documents: tvDocuments,
          log,
          progress,
          r2Client,
          upload,
        }),
      );
    } catch (error) {
      if (isNotFoundLike(error)) {
        skipped.push({ mediaType: "tv", reason: error.message, tmdbId });
        log(`${progress}: skipped (${error.message})`);
      } else {
        failures.push({ error: errorMessage(error), mediaType: "tv", tmdbId });
        log(`${progress}: failed (${errorMessage(error)})`);
      }
    }
  }

  log(
    `render complete: ${documentCount} HTML document(s), ${skipped.length} skipped, ${failures.length} failed`,
  );
  if (r2Client !== null) {
    log(`reading inventory: ${MEDIA_SEO_INVENTORY_KEY}`);
  }
  const existingInventory =
    r2Client === null ? [] : await readInventory(r2Client, MEDIA_SEO_INVENTORY_KEY);
  const inventory = mergeInventory(existingInventory, documentRecords);
  const sitemaps = buildSitemapDocuments(inventory, { siteOrigin });
  log(`sitemaps generated: ${sitemaps.length}`);
  const runId = `${lastmod}-${randomUUID()}`;
  const manifestKey = `${MEDIA_SEO_MANIFEST_PREFIX}/${runId}.json`;
  const manifest = {
    changedMovieIds,
    changedTvIds,
    documents: documentCount,
    failures,
    generatedAt: now.toISOString(),
    pending: pending.map(({ key: _key, ...request }) => request),
    runId,
    skipped,
    window,
  };
  const outputs = [
    ...sitemaps,
    {
      body: serializeInventory(inventory),
      contentType: "application/gzip",
      key: MEDIA_SEO_INVENTORY_KEY,
    },
    {
      body: `${JSON.stringify(manifest, null, 2)}\n`,
      contentType: "application/json;charset=utf-8",
      key: manifestKey,
    },
  ];

  if (failures.length === 0) {
    outputs.push({
      body: `${JSON.stringify(
        {
          lastManifestKey: manifestKey,
          lastSuccessfulEndDate: window.endDate,
          lastSuccessfulStartDate: window.startDate,
          updatedAt: now.toISOString(),
        },
        null,
        2,
      )}\n`,
      contentType: "application/json;charset=utf-8",
      key: MEDIA_SEO_STATE_KEY,
    });
  }

  log(`writing ${outputs.length} output object(s) to ${outDir}`);
  await writeOutputObjects(outDir, outputs);

  uploadSummary = mergeUploadSummary(
    uploadSummary,
    upload && r2Client !== null
      ? await uploadChangedObjects(r2Client, outputs, log)
      : { skipped: 0, uploaded: 0 },
  );

  if (upload && r2Client !== null && failures.length === 0) {
    log(`cleaning pending queue: ${pending.length} object(s)`);
    await Promise.all(pending.map((request) => r2Client.deleteObject(request.key)));
  }

  const summary = {
    documents: documentCount,
    failures,
    movieIds: allMovieIds,
    outDir,
    pending: pending.length,
    runId,
    skipped,
    tvIds: allTvIds,
    upload: uploadSummary,
    window,
  };

  if (failures.length > 0) {
    log(`failed with ${failures.length} item failure(s)`);
    const error = new Error(`Media SEO refresh failed for ${failures.length} item(s).`);
    error.summary = summary;
    throw error;
  }

  log(`done: uploaded ${uploadSummary.uploaded}, unchanged ${uploadSummary.skipped}`);
  return summary;
}

async function flushHtmlDocuments({ documents, log, progress, r2Client, upload }) {
  if (!upload || r2Client === null || documents.length === 0) {
    return { skipped: 0, uploaded: 0 };
  }

  log(`${progress}: flushing ${documents.length} HTML page(s) to R2`);
  return uploadChangedObjects(r2Client, documents.map(htmlDocumentOutput), log);
}

function htmlDocumentOutput(document) {
  return {
    body: document.html,
    contentType: "text/html;charset=utf-8",
    key: document.key,
  };
}

function mergeUploadSummary(left, right) {
  return {
    skipped: left.skipped + right.skipped,
    uploaded: left.uploaded + right.uploaded,
  };
}

function inventoryRecord(document, lastmod) {
  return {
    episodeNumber: document.episodeNumber,
    key: document.key,
    lastmod,
    locale: document.locale,
    mediaType: document.mediaType,
    pageType: document.pageType,
    publicPath: document.publicPath,
    seasonNumber: document.seasonNumber,
    tmdbId: document.tmdbId,
  };
}

async function renderMovieDocuments({ fetchImpl, siteOrigin, tmdbId, tmdbToken }) {
  const [en, vi] = await Promise.all([
    fetchTmdbMovieDetails({
      fetchImpl,
      language: TMDB_LANGUAGE_BY_LOCALE.en,
      tmdbId,
      token: tmdbToken,
    }),
    fetchTmdbMovieDetails({
      fetchImpl,
      language: TMDB_LANGUAGE_BY_LOCALE.vi,
      tmdbId,
      token: tmdbToken,
    }),
  ]);

  if (en === null && vi === null) {
    throw notFoundError("Movie not found.");
  }

  return buildMovieSeoDocuments({ en: en ?? vi, siteOrigin, vi: vi ?? en });
}

async function renderTvDocuments({
  fetchImpl,
  log = noopLog,
  progress = "tv",
  siteOrigin,
  tmdbId,
  tmdbToken,
}) {
  const [enSeries, viSeries] = await Promise.all([
    fetchTmdbTvDetails({
      fetchImpl,
      language: TMDB_LANGUAGE_BY_LOCALE.en,
      tmdbId,
      token: tmdbToken,
    }),
    fetchTmdbTvDetails({
      fetchImpl,
      language: TMDB_LANGUAGE_BY_LOCALE.vi,
      tmdbId,
      token: tmdbToken,
    }),
  ]);

  if (enSeries === null && viSeries === null) {
    throw notFoundError("TV series not found.");
  }

  const baseSeries = enSeries ?? viSeries;
  const seasonNumbers = uniqueSortedPositiveIntegers(
    (Array.isArray(baseSeries.seasons) ? baseSeries.seasons : [])
      .map((season) => season?.season_number)
      .filter((seasonNumber) => seasonNumber > 0),
  );
  const enSeasons = [];
  const viSeasons = [];

  log(`${progress}: fetching ${seasonNumbers.length} season(s)`);
  for (const [index, seasonNumber] of seasonNumbers.entries()) {
    log(`${progress}: season ${index + 1}/${seasonNumbers.length} (season ${seasonNumber})`);
    const [enSeason, viSeason] = await Promise.all([
      fetchTmdbTvSeasonDetails({
        fetchImpl,
        language: TMDB_LANGUAGE_BY_LOCALE.en,
        seasonNumber,
        tmdbId,
        token: tmdbToken,
      }),
      fetchTmdbTvSeasonDetails({
        fetchImpl,
        language: TMDB_LANGUAGE_BY_LOCALE.vi,
        seasonNumber,
        tmdbId,
        token: tmdbToken,
      }),
    ]);

    if (enSeason !== null) {
      enSeasons.push(enSeason);
    }
    if (viSeason !== null) {
      viSeasons.push(viSeason);
    }
  }

  return buildTvSeoDocuments({
    enSeasons,
    enSeries: enSeries ?? viSeries,
    siteOrigin,
    viSeasons,
    viSeries: viSeries ?? enSeries,
  });
}

async function readJsonObject(client, key, fallback) {
  const text = await client.getText(key);
  if (text === null) {
    return fallback;
  }
  return JSON.parse(text);
}

async function readInventory(client, key) {
  const bytes = await client.getBytes(key);
  if (bytes === null) {
    return [];
  }

  const text = gunzipSync(bytes).toString("utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function serializeInventory(records) {
  const lines = records
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((record) => JSON.stringify(record))
    .join("\n");
  return gzipSync(`${lines}\n`);
}

function mergeInventory(existingRecords, records) {
  const recordsByKey = new Map(
    existingRecords
      .filter((record) => typeof record?.key === "string")
      .map((record) => [record.key, record]),
  );

  for (const record of records) {
    recordsByKey.set(record.key, record);
  }

  return [...recordsByKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

async function readPendingRequests(client) {
  const keys = await client.listKeys(`${MEDIA_SEO_PENDING_PREFIX}/`);
  const requests = [];

  for (const key of keys) {
    const fromKey = pendingRequestFromKey(key);
    if (fromKey === null) {
      continue;
    }

    try {
      const text = await client.getText(key);
      const body = text === null || text.trim().length === 0 ? {} : JSON.parse(text);
      const normalized = normalizeEnsurePayload({
        ...body,
        mediaType: fromKey.mediaType,
        tmdbId: fromKey.tmdbId,
      });
      requests.push({ key, mediaType: normalized.mediaType, tmdbId: normalized.tmdbId });
    } catch {
      requests.push({ key, mediaType: fromKey.mediaType, tmdbId: fromKey.tmdbId });
    }
  }

  return requests;
}

function pendingRequestFromKey(key) {
  const match = /^pending\/on-demand\/(movie|tv)\/([1-9]\d*)\.json$/.exec(key);
  return match === null ? null : { mediaType: match[1], tmdbId: Number(match[2]) };
}

async function uploadChangedObjects(client, outputs, log = noopLog) {
  let skipped = 0;
  let uploaded = 0;

  log(`uploading changed objects to R2: ${outputs.length} candidate object(s)`);
  for (const [index, output] of outputs.entries()) {
    const progress = `upload ${index + 1}/${outputs.length}`;
    const nextBytes = toBytes(output.body);
    log(`${progress}: checking ${output.key}`);
    const currentBytes = await client.getBytes(output.key);

    if (currentBytes !== null && bytesEqual(currentBytes, nextBytes)) {
      skipped += 1;
      log(`${progress}: unchanged ${output.key}`);
      continue;
    }

    await client.putObject(output.key, nextBytes, output.contentType);
    uploaded += 1;
    log(`${progress}: uploaded ${output.key}`);
  }

  return { skipped, uploaded };
}

async function resetOutputDir(outDir) {
  await rm(outDir, { force: true, recursive: true });
}

async function writeOutputObjects(outDir, outputs) {
  for (const output of outputs) {
    const file = join(outDir, output.key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, output.body);
  }
}

function fixturePathForTmdbUrl(fixturesDir, url) {
  const language = url.searchParams.get("language") ?? TMDB_LANGUAGE_BY_LOCALE.en;
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.join("/") === "3/movie/changes") {
    return join(fixturesDir, "movie-changes.json");
  }
  if (parts.join("/") === "3/tv/changes") {
    return join(fixturesDir, "tv-changes.json");
  }
  if (parts[0] === "3" && parts[1] === "movie" && parts[2] !== undefined) {
    return join(fixturesDir, `movie-${parts[2]}-${language}.json`);
  }
  if (parts[0] === "3" && parts[1] === "tv" && parts[2] !== undefined && parts[3] === undefined) {
    return join(fixturesDir, `tv-${parts[2]}-${language}.json`);
  }
  if (parts[0] === "3" && parts[1] === "tv" && parts[3] === "season" && parts[4] !== undefined) {
    return join(fixturesDir, `tv-${parts[2]}-season-${parts[4]}-${language}.json`);
  }

  return join(fixturesDir, "missing.json");
}

function parseListBucketKeys(xml) {
  const keys = [];
  const keyPattern = /<Key>([\s\S]*?)<\/Key>/g;
  let match = keyPattern.exec(xml);
  while (match !== null) {
    keys.push(decodeXml(match[1]));
    match = keyPattern.exec(xml);
  }
  return keys;
}

function parseXmlTag(xml, tagName) {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`).exec(xml);
  return match === null ? null : decodeXml(match[1]);
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function canonicalQuery(query) {
  return Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .flatMap(([key, value]) =>
      Array.isArray(value) ? value.map((entry) => [key, entry]) : [[key, value]],
    )
    .map(([key, value]) => [awsEncode(key), awsEncode(String(value))])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function signatureKey(secretAccessKey, dateStamp, region, service) {
  const dateKey = hmacBytes(`AWS4${secretAccessKey}`, dateStamp);
  const dateRegionKey = hmacBytes(dateKey, region);
  const dateRegionServiceKey = hmacBytes(dateRegionKey, service);
  return hmacBytes(dateRegionServiceKey, "aws4_request");
}

function hmacBytes(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function amzDateString(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function uniqueSortedPositiveIntegers(values) {
  return [
    ...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0)),
  ].sort((a, b) => a - b);
}

function toBytes(value) {
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  return Buffer.from(value);
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function notFoundError(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function isNotFoundLike(error) {
  return typeof error?.status === "number" && error.status === 404;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseIdList(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return uniqueSortedPositiveIntegers(value.split(","));
}

function parseLogIntervalMs(value) {
  if (value === undefined || value.trim().length === 0) {
    return 10_000;
  }

  const intervalMs = Number(value);
  return Number.isFinite(intervalMs) && intervalMs >= 0 ? intervalMs : 10_000;
}

async function main() {
  const fixtureDir = process.env.MEDIA_SEO_FIXTURES_DIR;
  const fetchImpl = fixtureDir === undefined ? globalThis.fetch : createFixtureFetch(fixtureDir);
  const now =
    process.env.MEDIA_SEO_NOW === undefined ? new Date() : new Date(process.env.MEDIA_SEO_NOW);
  const upload = process.env.MEDIA_SEO_DRY_RUN === "true" ? false : true;
  const log = createThrottledLog((message) => console.log(`[media-seo] ${message}`), {
    intervalMs: parseLogIntervalMs(process.env.MEDIA_SEO_LOG_INTERVAL_MS),
  });
  const r2Client = upload
    ? createR2S3Client({
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        bucket: process.env.R2_BUCKET || MEDIA_SEO_BUCKET,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      })
    : null;

  let summary;
  try {
    summary = await buildMediaSeoBundle({
      fetchImpl,
      log,
      movieIds: parseIdList(process.env.MEDIA_SEO_MOVIE_IDS),
      now,
      outDir: process.env.MEDIA_SEO_OUT_DIR || DEFAULT_OUT_DIR,
      r2Client,
      siteOrigin: process.env.MEDIA_SEO_SITE_ORIGIN || MEDIA_SITE_ORIGIN,
      tmdbToken: process.env.TMDB_API_TOKEN,
      tvIds: parseIdList(process.env.MEDIA_SEO_TV_IDS),
      upload,
    });
  } finally {
    log.flush();
  }

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error?.summary !== undefined) {
      console.error(JSON.stringify(error.summary, null, 2));
    }
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
