/** Host-level lifecycle scaffolding for spawned app instances + shell chrome. */

import { debugWarn } from "~/core/debug";
import type { AppHandle } from "~/types/app";

export type LifecyclePhase =
  | "created"
  | "mounted"
  | "activated"
  | "deactivated"
  | "suspended"
  | "resumed"
  | "destroyed";

interface TrackedLifecycle {
  handle: AppHandle;
  listeners: Partial<Record<LifecyclePhase, Set<() => void>>>;
}

export class Lifecycle {
  private readonly registry = new Map<string, TrackedLifecycle>();

  register(handle: AppHandle): void {
    if (this.registry.has(handle.id)) {
      return;
    }

    this.registry.set(handle.id, {
      handle,
      listeners: {},
    });
  }

  unregister(handleId: string): void {
    this.registry.delete(handleId);
    // Hooks array cleared with map entry — simplifies HMR/leak avoidance.
  }

  on(phase: LifecyclePhase, handleId: string, callback: () => void): () => void {
    const record = this.registry.get(handleId);

    if (!record) {
      debugWarn(
        "[lifecycle] on() called for unregistered handle — listener dropped",
        phase,
        handleId,
      );

      return () => {};
    }

    const bucket = record.listeners[phase] ?? new Set<() => void>();
    bucket.add(callback);
    record.listeners[phase] = bucket;

    return (): void => {
      const live = this.registry.get(handleId);
      const liveBucket = live?.listeners[phase];

      if (!liveBucket) {
        return;
      }

      liveBucket.delete(callback);
    };
  }

  emit(phase: LifecyclePhase, handleId: string): void {
    const record = this.registry.get(handleId);
    if (!record) {
      return;
    }

    const bucket = record.listeners[phase];
    if (!bucket) {
      return;
    }

    for (const callback of Array.from(bucket)) {
      callback();
    }
  }
}
