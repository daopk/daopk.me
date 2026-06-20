/**
 * Primitives shared by the per-app URL → launch-intent plugins. Each app's
 * parser lives in its own module (`blogIntent`, `moviesIntent`,
 * `youtubePlayerIntent`); this module holds the bits they have in common so the
 * composer in `appUrlIntents.ts` and the plugins stay decoupled from one
 * another.
 */

export interface AppUrlLaunchIntent {
  kind: "app";
  manifestId: string;
  args?: Readonly<Record<string, unknown>>;
}

export type AppUrlIntent = AppUrlLaunchIntent | { kind: "none" };

export interface AppUrlIntentMetadata {
  readonly canonicalPath: string;
  readonly localeHint?: "vi";
  readonly originalPath: string;
}

export function appIntent(
  manifestId: string,
  args?: Readonly<Record<string, unknown>>,
  urlIntent?: AppUrlIntentMetadata,
): AppUrlLaunchIntent {
  const mergedArgs =
    urlIntent === undefined
      ? args
      : {
          ...args,
          urlIntent,
        };

  return {
    kind: "app",
    manifestId,
    ...(mergedArgs === undefined ? {} : { args: mergedArgs }),
  };
}

export function absoluteUrlFrom(input: string | URL): URL | null {
  if (input instanceof URL) {
    return input;
  }

  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function decodePathSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
}

export function nonEmptySearchParam(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key);
  if (value === null || value.length === 0) {
    return null;
  }

  return value;
}

export function booleanSearchParam(searchParams: URLSearchParams, key: string): boolean {
  const value = searchParams.get(key);
  return value === "1" || value === "true";
}
