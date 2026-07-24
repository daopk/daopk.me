import type { SupportedLocale } from "@daopk/sdk";
import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { createMoviesContent, type MoviePersonContentRequest } from "./moviesContent";
import {
  createInMemoryMoviesContentAdapter,
  type MoviesContentRemote,
} from "./moviesContentRemote";
import type { MovieDetail, MoviePersonDetail, MovieTrailerResult } from "./moviesApi";

describe("Movies content", () => {
  it("assembles detail content behind one interface with an in-memory adapter", async () => {
    const detail = movieDetail(550, "Fight Club");
    const trailer: MovieTrailerResult = { trailer: { key: "SUXWAEX2jlg" } };
    const module = createMoviesContent(
      createInMemoryMoviesContentAdapter({
        details: [{ mediaType: "movie", tmdbId: 550, value: detail }],
        trailers: [{ mediaType: "movie", tmdbId: 550, value: trailer }],
      }),
    );
    const locale = ref<SupportedLocale>("en");
    const scope = effectScope();
    const resource = scope.run(() =>
      module.use(() => ({ kind: "detail", mediaType: "movie", tmdbId: 550 }), locale),
    );

    expect(resource?.state.value).toBe("loading");
    await settleContent();

    expect(resource?.state.value).toBe("ready");
    expect(resource?.content.value).toEqual({
      detail,
      kind: "detail",
      trailerKey: "SUXWAEX2jlg",
    });
    scope.stop();
  });

  it("does not let a stale failure overwrite a newer request", async () => {
    const first = deferred<MoviePersonDetail>();
    const second = deferred<MoviePersonDetail>();
    const signals: AbortSignal[] = [];
    const baseAdapter = createInMemoryMoviesContentAdapter({});
    const remote: MoviesContentRemote = {
      ...baseAdapter,
      fetchPerson: vi.fn((_, options) => {
        signals.push(options.signal);
        return signals.length === 1 ? first.promise : second.promise;
      }),
    };
    const module = createMoviesContent(remote);
    const locale = ref<SupportedLocale>("en");
    const request = ref<MoviePersonContentRequest>({
      kind: "person",
      tmdbId: 1,
    });
    const scope = effectScope();
    const resource = scope.run(() => module.use(() => request.value, locale));

    request.value = { kind: "person", tmdbId: 2 };
    await nextTick();

    expect(signals[0]?.aborted).toBe(true);
    expect(resource?.state.value).toBe("loading");

    first.reject(new Error("Stale request failed."));
    await settleContent();

    expect(resource?.state.value).toBe("loading");
    expect(resource?.content.value).toBeNull();

    const currentPerson = moviePerson(2, "Current Person");
    second.resolve(currentPerson);
    await settleContent();

    expect(resource?.state.value).toBe("ready");
    expect(resource?.content.value).toEqual({
      kind: "person",
      person: currentPerson,
    });
    scope.stop();
  });

  it("reloads for locale changes and aborts when its scope is disposed", async () => {
    const requests: Array<{
      readonly locale: SupportedLocale;
      readonly signal: AbortSignal;
    }> = [];
    const pending = [deferred<MoviePersonDetail>(), deferred<MoviePersonDetail>()];
    const baseAdapter = createInMemoryMoviesContentAdapter({});
    const remote: MoviesContentRemote = {
      ...baseAdapter,
      fetchPerson: vi.fn((_, options) => {
        requests.push(options);
        return pending[requests.length - 1]!.promise;
      }),
    };
    const module = createMoviesContent(remote);
    const locale = ref<SupportedLocale>("en");
    const scope = effectScope();
    const resource = scope.run(() => module.use(() => ({ kind: "person", tmdbId: 1 }), locale));

    locale.value = "vi";
    await nextTick();

    expect(requests.map((request) => request.locale)).toEqual(["en", "vi"]);
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(resource?.state.value).toBe("loading");

    scope.stop();

    expect(requests[1]?.signal.aborted).toBe(true);
    pending[1]?.resolve(moviePerson(1, "Ignored Person"));
    await settleContent();
    expect(resource?.content.value).toBeNull();
  });
});

async function settleContent(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly reject: (error: unknown) => void;
  readonly resolve: (value: T) => void;
} {
  let reject!: (error: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    reject = nextReject;
    resolve = nextResolve;
  });
  return { promise, reject, resolve };
}

function movieDetail(tmdbId: number, name: string): MovieDetail {
  return {
    backdropUrl: "",
    canonicalPath: `/movie/${tmdbId}`,
    cast: [],
    collection: null,
    content: "",
    crew: [],
    episodeTotal: "",
    facts: [],
    genres: [],
    id: `movie-${tmdbId}`,
    mediaType: "movie",
    name,
    originName: name,
    overview: "",
    play: null,
    posterUrl: "",
    rating: null,
    releaseDate: "",
    runtime: null,
    seasons: [],
    slug: name.toLowerCase().replaceAll(" ", "-"),
    status: "",
    thumbUrl: "",
    tmdbId,
    year: null,
  };
}

function moviePerson(tmdbId: number, name: string): MoviePersonDetail {
  return {
    biography: "",
    birthday: "",
    canonicalPath: `/person/${tmdbId}`,
    credits: [],
    deathday: "",
    facts: [],
    id: `person-${tmdbId}`,
    knownFor: [],
    knownForDepartment: "",
    name,
    placeOfBirth: "",
    profileUrl: "",
    slug: name.toLowerCase().replaceAll(" ", "-"),
    tmdbId,
  };
}
