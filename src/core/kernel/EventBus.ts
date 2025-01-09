import type { KernelEventMap, KernelEventsFacade } from "~/types/kernel";

type Listener<K extends keyof KernelEventMap = keyof KernelEventMap> = (
  payload: KernelEventMap[K],
) => void;

type ListenerBuckets = Map<keyof KernelEventMap, Set<Listener>>;

export class EventBus implements KernelEventsFacade {
  private readonly registry: ListenerBuckets = new Map();

  emit<K extends keyof KernelEventMap>(channel: K, payload: KernelEventMap[K]): void {
    const listeners = this.registry.get(channel);
    if (!listeners) {
      return;
    }

    for (const listener of Array.from(listeners)) {
      listener(payload);
    }
  }

  on<K extends keyof KernelEventMap>(channel: K, listener: Listener<K>): () => void {
    const bucket = this.registry.get(channel) ?? new Set<Listener>();
    bucket.add(listener as Listener);
    this.registry.set(channel, bucket);

    return () => {
      this.off(channel, listener);
    };
  }

  once<K extends keyof KernelEventMap>(channel: K, listener: Listener<K>): () => void {
    let disposer: (() => void) | undefined;
    const wrapper: Listener<K> = (payload): void => {
      disposer?.();
      listener(payload);
    };

    disposer = this.on(channel, wrapper);

    return () => {
      this.off(channel, wrapper);
    };
  }

  off<K extends keyof KernelEventMap>(channel: K, listener: Listener<K>): void {
    const current = this.registry.get(channel);
    if (!current) {
      return;
    }

    current.delete(listener as Listener);
    if (current.size === 0) {
      this.registry.delete(channel);
    }
  }
}
