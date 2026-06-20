import { Registry } from "~/core/kernel/Registry";
import type { WallpaperManifest } from "~/types/wallpaper";

/**
 * Thrown when a registered manifest carries the Settings-internal
 * `userBlobKey` field. Callers MUST strip the field before calling
 * `register` (or use the `WallpaperManifest` type, which doesn't
 * declare it). The error message names the offending id so the source
 * of the misuse is obvious in stack traces and in dev console output.
 */
export class WallpaperRegistryRejectionError extends Error {
  override readonly name = "WallpaperRegistryRejectionError";

  constructor(
    public readonly id: string,
    public readonly reason: "user-blob-key-not-allowed",
  ) {
    super(
      reason === "user-blob-key-not-allowed"
        ? `Wallpaper manifest "${id}" carries the Settings-internal \`userBlobKey\` field — strip it before registering. The registry surface is reserved for built-ins + plugin wallpapers; user uploads belong in WallpaperStore (see D40).`
        : `Wallpaper manifest "${id}" was rejected: ${reason}`,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WallpaperRegistry extends Registry<WallpaperManifest> {
  constructor() {
    super({ keyOf: (manifest) => manifest.id });
  }

  override register(manifest: WallpaperManifest): () => void {
    if ("userBlobKey" in manifest) {
      const probe = manifest as { userBlobKey?: unknown };
      if (probe.userBlobKey != null && probe.userBlobKey !== "") {
        throw new WallpaperRegistryRejectionError(manifest.id, "user-blob-key-not-allowed");
      }
    }

    return super.register(manifest);
  }

  list(): readonly WallpaperManifest[] {
    return Object.freeze(this.entries());
  }
}
