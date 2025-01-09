import type { Component } from "vue";

import type { AppHandle } from "~/types/app";
import type { Kernel } from "~/types/kernel";

export type CommandSource = "spotlight" | "dock" | "menu" | "shortcut" | "terminal" | "api";

/**
 * Per-dispatch bindings handed to `CommandManifest.run`. Immutable for the
 * dispatch turn; long-running commands must honor `signal` to bail when the
 * dispatcher unmounts (Spotlight closes, terminal aborts, app teardown, …).
 */
export interface CommandContext {
  /** Kernel singleton — re-exposed so command bodies do not need to import `~/core`. */
  kernel: Kernel;
  source: CommandSource;
  activeHandle: AppHandle | null;
  payload: Readonly<Record<string, unknown>>;
  /** Tied to dispatcher unmount/escape. Long-running commands MUST observe this. */
  signal: AbortSignal;
}

export interface CommandManifest {
  id: string;
  title: string;
  hint?: string;
  icon?: Component;
  shortcut?: string;
  scope?: "global" | "app" | "shell";
  keywords?: string[];
  run: (ctx: CommandContext) => void | Promise<void>;
}

/**
 * Optional per-dispatch overrides. Useful for routing dispatch through a
 * specific surface (`source: "spotlight"`) or threading a cancellation token
 * from the surface that owns the dispatcher chrome (e.g. Spotlight Esc).
 */
export interface CommandDispatchOptions {
  source?: CommandSource;
  activeHandle?: AppHandle | null;
  payload?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}

export interface KernelCommandsFacade {
  /**
   * Registers a manifest. Returns a disposer that unregisters the SAME
   * manifest instance (idempotent — safe to call after `unregister(id)` already
   * cleared the slot, or after a re-register replaced the manifest).
   *
   * @throws {CommandDuplicateError} when `manifest.id` is already registered.
   */
  register(manifest: CommandManifest): () => void;
  unregister(id: string): void;
  dispatch(id: string, options?: CommandDispatchOptions): Promise<void>;
  list(): readonly CommandManifest[];
}
