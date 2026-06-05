export const BLOG_THUMBNAIL_WIDTH: 1024;
export const BLOG_THUMBNAIL_HEIGHT: 576;
export const BLOG_THUMBNAIL_BASE_PATH: "/_worker/blog/thumbnails";
export const BLOG_THUMBNAIL_R2_PREFIX: "thumbnails";
export const BLOG_THUMBNAIL_DEFAULT_MODEL: string;
export const CLOUDFLARE_IMAGE_MODEL_PREFIX: "@cf/black-forest-labs/";

export interface BlogThumbnail {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

export interface BlogThumbnailIndexEntry {
  readonly slug: string;
  readonly title?: string | null;
  readonly date?: string | null;
  readonly description?: string | null;
  readonly thumbnail?: BlogThumbnail | null;
}

export interface ThumbnailMetadata {
  readonly contentType: "image/png" | "image/jpeg" | "image/webp";
  readonly key: string;
  readonly thumbnail: BlogThumbnail;
}

export function normalizeCloudflareImageModel(model?: string): string;
export function cloudflareImageModelId(model?: string): string;
export function isBlogThumbnail(value: unknown, slug: string): value is BlogThumbnail;
export function validateRegenerateSlug(options: {
  readonly entries: readonly BlogThumbnailIndexEntry[];
  readonly regenerate: unknown;
  readonly slug: unknown;
}): string | null;
export function mergeReusableThumbnails(
  entries: readonly BlogThumbnailIndexEntry[],
  currentEntries: readonly unknown[],
): BlogThumbnailIndexEntry[];
export function detectImageFormat(bytes: Uint8Array): {
  readonly contentType: ThumbnailMetadata["contentType"];
  readonly extension: "png" | "jpg" | "webp";
};
export function createThumbnailMetadata(options: {
  readonly bytes: Uint8Array;
  readonly id?: string;
  readonly slug: string;
  readonly title: string;
}): ThumbnailMetadata;
export function buildThumbnailPrompt(options: {
  readonly body: string;
  readonly description?: string | null;
  readonly thumbnailPrompt?: string | null;
  readonly title: string;
}): string;
export function runCloudflareImageGeneration(options: {
  readonly accountId: string;
  readonly apiToken: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly height?: number;
  readonly model?: string;
  readonly prompt: string;
  readonly width?: number;
}): Promise<Buffer>;
export function generateBlogThumbnailsInBundle(options: {
  readonly accountId?: string;
  readonly apiToken?: string;
  readonly currentIndexFile?: string;
  readonly fetchImpl?: typeof globalThis.fetch;
  readonly generateImage?: (options: {
    readonly accountId: string;
    readonly apiToken: string;
    readonly fetchImpl: typeof globalThis.fetch;
    readonly height: number;
    readonly model: string;
    readonly prompt: string;
    readonly slug: string;
    readonly width: number;
  }) => Promise<Uint8Array>;
  readonly model?: string;
  readonly onError?: (error: unknown) => void;
  readonly onPrompt?: (payload: {
    readonly model: string;
    readonly prompt: string;
    readonly slug: string;
    readonly title: string;
  }) => void;
  readonly outDir: string;
  readonly postsDir: string;
  readonly regenerate?: boolean | string;
  readonly slug?: string;
}): Promise<{
  readonly failed: number;
  readonly generated: number;
  readonly reused: number;
  readonly total: number;
}>;
