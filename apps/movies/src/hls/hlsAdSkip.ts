import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderResponse,
  LoaderStats,
  PlaylistLoaderContext,
} from "hls.js";

export interface HlsPlaylistSegment {
  readonly durationSeconds: number;
  readonly index: number;
  readonly leadingDiscontinuityCount: number;
  readonly lines: readonly string[];
  readonly uri: string;
}

export interface HlsAdReplacementGroup {
  readonly durationSeconds: number;
  readonly ruleId: string;
  readonly segmentCount: number;
  readonly segments: readonly HlsPlaylistSegment[];
}

export interface HlsAdReplacementRule {
  readonly id: string;
  readonly maxDurationSeconds?: number;
  readonly minDurationSeconds?: number;
  readonly minSegmentCount?: number;
  matchesSegment(segment: HlsPlaylistSegment, context: HlsAdSkipContext): boolean;
  shouldSkipGroup?(group: HlsAdReplacementGroup, context: HlsAdSkipContext): boolean;
}

export interface HlsAdSkipContext {
  readonly playlistUrl?: string;
}

export interface HlsAdSkipOptions {
  readonly enabled?: boolean;
  readonly preserveBoundaryDiscontinuity?: boolean;
  readonly replacementRules?: readonly HlsAdReplacementRule[];
}

export interface HlsAdSkipResult {
  readonly playlist: string;
  readonly removedGroups: readonly HlsAdReplacementGroup[];
}

type HlsPlaylistItem =
  | {
      readonly kind: "line";
      readonly line: string;
    }
  | {
      readonly kind: "segment";
      readonly segment: HlsPlaylistSegment;
    };

const DEFAULT_MIN_REPLACEMENT_AD_DURATION_SECONDS = 15;
const DEFAULT_MAX_REPLACEMENT_AD_DURATION_SECONDS = 90;
const DEFAULT_MIN_REPLACEMENT_AD_SEGMENTS = 2;
const HASHED_SEGMENT_SEQUENCE_PATH_PATTERN = /^\/v\d+\/[a-f0-9]{16,}\/segment_\d+\.ts$/i;

export const hashedSegmentSequenceReplacementRule: HlsAdReplacementRule = {
  id: "hashed-segment-sequence-replacement",
  matchesSegment: (segment, context) => {
    const pathname = segmentUriPathname(segment.uri, context.playlistUrl);
    return HASHED_SEGMENT_SEQUENCE_PATH_PATTERN.test(pathname);
  },
  maxDurationSeconds: DEFAULT_MAX_REPLACEMENT_AD_DURATION_SECONDS,
  minDurationSeconds: DEFAULT_MIN_REPLACEMENT_AD_DURATION_SECONDS,
  minSegmentCount: DEFAULT_MIN_REPLACEMENT_AD_SEGMENTS,
};

const DEFAULT_HLS_AD_SKIP_OPTIONS: Required<HlsAdSkipOptions> = {
  enabled: true,
  preserveBoundaryDiscontinuity: true,
  replacementRules: [hashedSegmentSequenceReplacementRule],
};

export function rewriteHlsPlaylistForAdSkip(
  playlist: string,
  context: HlsAdSkipContext = {},
  options: HlsAdSkipOptions = {},
): HlsAdSkipResult {
  const resolvedOptions = resolveOptions(options);
  if (!resolvedOptions.enabled || resolvedOptions.replacementRules.length === 0) {
    return { playlist, removedGroups: [] };
  }

  const parsed = parseHlsPlaylist(playlist);
  if (parsed.segments.length === 0) {
    return { playlist, removedGroups: [] };
  }

  const removedGroups = findReplacementGroups(
    parsed.segments,
    context,
    resolvedOptions.replacementRules,
  );
  if (removedGroups.length === 0) {
    return { playlist, removedGroups };
  }

  const removedSegmentIndexes = new Set<number>();
  for (const group of removedGroups) {
    for (const segment of group.segments) {
      removedSegmentIndexes.add(segment.index);
    }
  }

  const boundaryDiscontinuitySegmentIndexes = resolvedOptions.preserveBoundaryDiscontinuity
    ? nextKeptSegmentsAfterRemovedGroups(parsed.segments, removedGroups, removedSegmentIndexes)
    : new Set<number>();

  const nextLines: string[] = [];
  for (const item of parsed.items) {
    if (item.kind === "line") {
      nextLines.push(item.line);
      continue;
    }

    const { segment } = item;
    if (removedSegmentIndexes.has(segment.index)) {
      continue;
    }

    if (boundaryDiscontinuitySegmentIndexes.has(segment.index)) {
      nextLines.push(...withSingleLeadingDiscontinuity(segment.lines));
    } else {
      nextLines.push(...segment.lines);
    }
  }

  return {
    playlist: `${nextLines.join(parsed.newline)}${parsed.trailingNewline}`,
    removedGroups,
  };
}

export function createAdSkippingPlaylistLoader(
  options: HlsAdSkipOptions = {},
): new (config: HlsConfig) => Loader<PlaylistLoaderContext> {
  return class AdSkippingPlaylistLoader implements Loader<PlaylistLoaderContext> {
    private readonly loader: Loader<PlaylistLoaderContext>;

    constructor(config: HlsConfig) {
      const LoaderClass = config.loader as unknown as new (
        config: HlsConfig,
      ) => Loader<PlaylistLoaderContext>;
      this.loader = new LoaderClass(config);
    }

    get context(): PlaylistLoaderContext | null {
      return this.loader.context;
    }

    get stats(): LoaderStats {
      return this.loader.stats;
    }

    abort(): void {
      this.loader.abort();
    }

    destroy(): void {
      this.loader.destroy();
    }

    getCacheAge(): number | null {
      return this.loader.getCacheAge?.() ?? null;
    }

    getResponseHeader(name: string): string | null {
      return this.loader.getResponseHeader?.(name) ?? null;
    }

    load(
      context: PlaylistLoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<PlaylistLoaderContext>,
    ): void {
      this.loader.load(context, config, {
        ...callbacks,
        onSuccess: (response, stats, loadedContext, networkDetails) => {
          callbacks.onSuccess(
            rewritePlaylistLoaderResponse(response, loadedContext, options),
            stats,
            loadedContext,
            networkDetails,
          );
        },
      });
    }
  };
}

export function createMoviesHlsConfig(options: HlsAdSkipOptions = {}): Partial<HlsConfig> {
  return {
    pLoader: createAdSkippingPlaylistLoader(options),
  };
}

function resolveOptions(options: HlsAdSkipOptions): Required<HlsAdSkipOptions> {
  return {
    enabled: options.enabled ?? DEFAULT_HLS_AD_SKIP_OPTIONS.enabled,
    preserveBoundaryDiscontinuity:
      options.preserveBoundaryDiscontinuity ??
      DEFAULT_HLS_AD_SKIP_OPTIONS.preserveBoundaryDiscontinuity,
    replacementRules: options.replacementRules ?? DEFAULT_HLS_AD_SKIP_OPTIONS.replacementRules,
  };
}

function rewritePlaylistLoaderResponse(
  response: LoaderResponse,
  context: PlaylistLoaderContext,
  options: HlsAdSkipOptions,
): LoaderResponse {
  if (typeof response.data !== "string") {
    return response;
  }

  const result = rewriteHlsPlaylistForAdSkip(
    response.data,
    {
      playlistUrl: response.url || context.url,
    },
    options,
  );

  if (result.removedGroups.length === 0) {
    return response;
  }

  return {
    ...response,
    data: result.playlist,
  };
}

function parseHlsPlaylist(playlist: string): {
  readonly items: readonly HlsPlaylistItem[];
  readonly newline: string;
  readonly segments: readonly HlsPlaylistSegment[];
  readonly trailingNewline: string;
} {
  const newline = playlist.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = playlist.endsWith("\r\n") ? "\r\n" : playlist.endsWith("\n") ? "\n" : "";
  const lines = playlist.replace(/\r?\n$/, "").split(/\r?\n/);
  const items: HlsPlaylistItem[] = [];
  const segments: HlsPlaylistSegment[] = [];
  let pendingScopedLines: string[] = [];
  let segmentLines: string[] | null = null;

  for (const line of lines) {
    if (segmentLines !== null) {
      segmentLines.push(line);
      if (isUriLine(line)) {
        const segment = createSegment(segmentLines, segments.length);
        items.push({ kind: "segment", segment });
        segments.push(segment);
        segmentLines = null;
      }
      continue;
    }

    if (line.startsWith("#EXTINF:")) {
      segmentLines = [...pendingScopedLines, line];
      pendingScopedLines = [];
      continue;
    }

    if (isSegmentScopedLine(line)) {
      pendingScopedLines.push(line);
      continue;
    }

    if (pendingScopedLines.length > 0) {
      items.push(
        ...pendingScopedLines.map((pendingLine) => ({ kind: "line", line: pendingLine }) as const),
      );
      pendingScopedLines = [];
    }
    items.push({ kind: "line", line });
  }

  if (segmentLines !== null) {
    items.push(...segmentLines.map((line) => ({ kind: "line", line }) as const));
  }
  if (pendingScopedLines.length > 0) {
    items.push(...pendingScopedLines.map((line) => ({ kind: "line", line }) as const));
  }

  return { items, newline, segments, trailingNewline };
}

function createSegment(lines: readonly string[], index: number): HlsPlaylistSegment {
  const uri = lines[lines.length - 1] ?? "";
  return {
    durationSeconds: extInfDurationSeconds(lines),
    index,
    leadingDiscontinuityCount: leadingDiscontinuityCount(lines),
    lines,
    uri,
  };
}

function extInfDurationSeconds(lines: readonly string[]): number {
  const extInfLine = lines.find((line) => line.startsWith("#EXTINF:"));
  if (extInfLine === undefined) {
    return 0;
  }

  const rawDuration = extInfLine.slice("#EXTINF:".length).split(",", 1)[0] ?? "";
  const duration = Number.parseFloat(rawDuration);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function leadingDiscontinuityCount(lines: readonly string[]): number {
  let count = 0;
  for (const line of lines) {
    if (line === "#EXT-X-DISCONTINUITY") {
      count += 1;
      continue;
    }

    if (line.trim().length === 0) {
      continue;
    }

    break;
  }
  return count;
}

function isUriLine(line: string): boolean {
  return line.trim().length > 0 && !line.startsWith("#");
}

function isSegmentScopedLine(line: string): boolean {
  return line === "#EXT-X-DISCONTINUITY";
}

function findReplacementGroups(
  segments: readonly HlsPlaylistSegment[],
  context: HlsAdSkipContext,
  rules: readonly HlsAdReplacementRule[],
): readonly HlsAdReplacementGroup[] {
  const groups: HlsAdReplacementGroup[] = [];
  let index = 0;

  while (index < segments.length) {
    const rule = rules.find((candidate) => candidate.matchesSegment(segments[index]!, context));
    if (rule === undefined) {
      index += 1;
      continue;
    }

    const groupSegments: HlsPlaylistSegment[] = [];
    while (index < segments.length && rule.matchesSegment(segments[index]!, context)) {
      groupSegments.push(segments[index]!);
      index += 1;
    }

    const group = createReplacementGroup(rule.id, groupSegments);
    if (shouldSkipGroup(group, rule, context)) {
      groups.push(group);
    }
  }

  return groups;
}

function createReplacementGroup(
  ruleId: string,
  segments: readonly HlsPlaylistSegment[],
): HlsAdReplacementGroup {
  return {
    durationSeconds: segments.reduce((total, segment) => total + segment.durationSeconds, 0),
    ruleId,
    segmentCount: segments.length,
    segments,
  };
}

function shouldSkipGroup(
  group: HlsAdReplacementGroup,
  rule: HlsAdReplacementRule,
  context: HlsAdSkipContext,
): boolean {
  const minSegmentCount = rule.minSegmentCount ?? DEFAULT_MIN_REPLACEMENT_AD_SEGMENTS;
  const minDurationSeconds = rule.minDurationSeconds ?? DEFAULT_MIN_REPLACEMENT_AD_DURATION_SECONDS;
  const maxDurationSeconds = rule.maxDurationSeconds ?? DEFAULT_MAX_REPLACEMENT_AD_DURATION_SECONDS;

  if (
    group.segmentCount < minSegmentCount ||
    group.durationSeconds < minDurationSeconds ||
    group.durationSeconds > maxDurationSeconds
  ) {
    return false;
  }

  return rule.shouldSkipGroup?.(group, context) ?? true;
}

function nextKeptSegmentsAfterRemovedGroups(
  segments: readonly HlsPlaylistSegment[],
  removedGroups: readonly HlsAdReplacementGroup[],
  removedSegmentIndexes: ReadonlySet<number>,
): Set<number> {
  const indexes = new Set<number>();
  for (const group of removedGroups) {
    const firstSegment = group.segments[0];
    const lastSegment = group.segments[group.segments.length - 1];
    if (firstSegment === undefined || lastSegment === undefined) {
      continue;
    }

    const nextKeptSegment = segments.find(
      (segment) => segment.index > lastSegment.index && !removedSegmentIndexes.has(segment.index),
    );
    if (
      nextKeptSegment !== undefined &&
      (firstSegment.leadingDiscontinuityCount > 0 || nextKeptSegment.leadingDiscontinuityCount > 0)
    ) {
      indexes.add(nextKeptSegment.index);
    }
  }
  return indexes;
}

function withSingleLeadingDiscontinuity(lines: readonly string[]): readonly string[] {
  const nextLines = [...lines];
  while (nextLines[0] === "#EXT-X-DISCONTINUITY") {
    nextLines.shift();
  }
  return ["#EXT-X-DISCONTINUITY", ...nextLines];
}

function segmentUriPathname(uri: string, playlistUrl: string | undefined): string {
  try {
    return new URL(uri, playlistUrl).pathname;
  } catch {
    return uri.split(/[?#]/, 1)[0] ?? uri;
  }
}
