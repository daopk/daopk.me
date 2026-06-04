/** Logical document key under KV namespace `settings` → physical `settings:state` in localStorage. */

export const SETTINGS_KV_PRIMARY_KEY = "state";

export const TOKEN_OVERRIDES_KV_NAMESPACE = "tokens";
export const TOKEN_OVERRIDES_KV_PRIMARY_KEY = "state";

export const WALLPAPERS_KV_NAMESPACE = "wallpapers";
export const WALLPAPERS_KV_PRIMARY_KEY = "state";
export const WALLPAPERS_IDB_DB_NAME = "daopk.wallpapers";
export const WALLPAPERS_IDB_STORE_NAME = "blobs";
export const WALLPAPERS_IDB_VERSION = 1;

export const WALLPAPER_BLOB_CAP_BYTES = 5 * 1024 * 1024;

export const WALLPAPER_COUNT_CAP = 10;

export const WALLPAPER_MAX_DIMENSION_PX = 4096;

/**
 * Spotlight recents.
 *
 * Same separation pattern as `tokens:state` and `wallpapers:state`:
 * keep recents in their own KV namespace so cross-tab sync, hydration
 * timing, and dispose ownership stay isolated from `SettingsStore`.
 * Physical key: `spotlight:state` in `localStorage`.
 */
export const SPOTLIGHT_KV_NAMESPACE = "spotlight";
export const SPOTLIGHT_KV_PRIMARY_KEY = "state";

export const SPOTLIGHT_RECENTS_CAP = 10;

export const WIDGETS_KV_NAMESPACE = "widgets";
export const WIDGETS_KV_PRIMARY_KEY = "state";

export const PERMISSIONS_KV_NAMESPACE = "permissions";
export const PERMISSIONS_KV_PRIMARY_KEY = "state";

export const VFS_IDB_DB_NAME = "daopk.vfs";
export const VFS_IDB_STORE_NAME = "nodes";
export const VFS_IDB_VERSION = 1;
