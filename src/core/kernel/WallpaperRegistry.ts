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

export class WallpaperRegistry {
  private readonly manifests = new Map<string, WallpaperManifest>();

  register(manifest: WallpaperManifest): () => void {
    if ("userBlobKey" in manifest) {
      const probe = manifest as { userBlobKey?: unknown };
      if (probe.userBlobKey != null && probe.userBlobKey !== "") {
        throw new WallpaperRegistryRejectionError(manifest.id, "user-blob-key-not-allowed");
      }
    }

    this.manifests.set(manifest.id, manifest);

    return (): void => {
      if (this.manifests.get(manifest.id) === manifest) {
        this.manifests.delete(manifest.id);
      }
    };
  }

  unregister(id: string): boolean {
    return this.manifests.delete(id);
  }

  has(id: string): boolean {
    return this.manifests.has(id);
  }

  get(id: string): WallpaperManifest | undefined {
    return this.manifests.get(id);
  }

  list(): readonly WallpaperManifest[] {
    return Object.freeze(Array.from(this.manifests.values()));
  }

  /**
   * Test-only escape hatch for resetting the registry between test
   * cases without spinning up a fresh kernel. Production code MUST
   * NOT call this — registry teardown is the kernel's responsibility
   * (managed via `kernel.dispose`).
   */
  __resetForTests(): void {
    this.manifests.clear();
  }
}
