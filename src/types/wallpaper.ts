/**
 * User-uploaded wallpaper metadata.
 *
 * The blob itself lives in a dedicated `IndexedDBStore<Blob>` keyed by `id`.
 * This metadata index lives in KV namespace `wallpapers:state` (cross-tab
 * synced via `storage` events; blobs themselves cross-tab automatically
 * via IndexedDB).
 */

import type { ResolvedTheme } from "~/types/theme";
import type { ShellId } from "~/types/shell";

export interface UserWallpaperMeta {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: number;
}

export interface WallpapersState {
  index: readonly UserWallpaperMeta[];
}

export type WallpaperUploadResult =
  | { ok: true; meta: UserWallpaperMeta }
  | { ok: false; reason: "too-large" | "count-cap" | "invalid-type" | "io-error"; message: string };

export interface WallpaperManifest {
  /**
   * Stable id. Conventions: short kebab-case for built-ins
   * (`still-waters`, `aurora-night`); plugin authors namespace with
   * their app id (`my-app:sunset`). Re-registering the same id is an
   * UPSERT (matches `WidgetManifest` + `AppManifest` patterns; mirrors
   * HMR + plugin live-reload ergonomics). Emits
   * `wallpaper.registered { id }` exactly once per call.
   */
  id: string;
  name: string;
  type: "solid" | "gradient" | "image";
  value: string;
  valueByShell?: Partial<Record<ShellId, string>>;
  preferredTheme?: ResolvedTheme;
}

export interface KernelWallpapersFacade {
  register(manifest: WallpaperManifest): () => void;
  unregister(id: string): void;
  list(): readonly WallpaperManifest[];
  get(id: string): WallpaperManifest | undefined;
}
