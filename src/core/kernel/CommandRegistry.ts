import { CommandDuplicateError, CommandNotFoundError } from "~/core/kernel/errors";
import type { CommandContext, CommandManifest } from "~/types/command";

export class CommandRegistry {
  private readonly manifests = new Map<string, CommandManifest>();

  register(manifest: CommandManifest): () => void {
    if (this.manifests.has(manifest.id)) {
      throw new CommandDuplicateError(manifest.id);
    }

    this.manifests.set(manifest.id, manifest);

    // Disposer is idempotent: it only removes the slot if THIS manifest still
    return (): void => {
      if (this.manifests.get(manifest.id) === manifest) {
        this.manifests.delete(manifest.id);
      }
    };
  }

  unregister(id: string): void {
    this.manifests.delete(id);
  }

  has(id: string): boolean {
    return this.manifests.has(id);
  }

  get(id: string): CommandManifest | undefined {
    return this.manifests.get(id);
  }

  list(): readonly CommandManifest[] {
    return Array.from(this.manifests.values());
  }

  async dispatch(id: string, ctx: CommandContext): Promise<void> {
    const manifest = this.manifests.get(id);

    if (!manifest) {
      throw new CommandNotFoundError(id);
    }

    await manifest.run(ctx);
  }
}
