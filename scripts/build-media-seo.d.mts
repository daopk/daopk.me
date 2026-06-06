export interface R2S3Client {
  deleteObject(key: string): Promise<void>;
  getBytes(key: string): Promise<Uint8Array | null>;
  getText(key: string): Promise<string | null>;
  listKeys(prefix: string): Promise<string[]>;
  putObject(
    key: string,
    body: string | Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<void>;
}

export interface MediaSeoBuildSummary {
  readonly documents: number;
  readonly failures: readonly unknown[];
  readonly movieIds: readonly number[];
  readonly outDir: string;
  readonly pending: number;
  readonly runId: string;
  readonly skipped: readonly unknown[];
  readonly tvIds: readonly number[];
  readonly upload: {
    readonly skipped: number;
    readonly uploaded: number;
  };
  readonly window: {
    readonly endDate: string;
    readonly startDate: string;
  };
}

export interface MediaSeoProgressLog {
  (message: string): void;
  flush(): void;
}

export function utcDateString(date?: Date): string;
export function addUtcDays(dateString: string, days: number): string;
export function mediaSeoChangeWindow(
  state?: { readonly lastSuccessfulEndDate?: string | null },
  now?: Date,
): { readonly endDate: string; readonly startDate: string };
export function createThrottledLog(
  write: (message: string) => void,
  options?: {
    readonly clearTimer?: (timer: unknown) => void;
    readonly intervalMs?: number;
    readonly now?: () => number;
    readonly setTimer?: (callback: () => void, delay: number) => unknown;
  },
): MediaSeoProgressLog;
export function createR2S3Client(options: {
  readonly accessKeyId?: string;
  readonly accountId?: string;
  readonly bucket?: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly secretAccessKey?: string;
}): R2S3Client;
export function createFixtureFetch(fixturesDir: string): typeof globalThis.fetch;
export function buildMediaSeoBundle(options?: {
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly log?: (message: string) => void;
  readonly movieIds?: readonly number[];
  readonly now?: Date;
  readonly outDir?: string;
  readonly r2Client?: R2S3Client | null;
  readonly siteOrigin?: string;
  readonly tmdbToken?: string;
  readonly tvIds?: readonly number[];
  readonly upload?: boolean;
}): Promise<MediaSeoBuildSummary>;
