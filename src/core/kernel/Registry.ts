/**
 * Slot for a registered entry. `registeredAt` is a monotonic counter used as a
 * stable tie-break for ordered registries; registries that don't order entries
 * (e.g. wallpapers) simply ignore it.
 */
export interface RegistrySlot<TEntry> {
  readonly entry: TEntry;
  readonly registeredAt: number;
}

export type RegistryComparator<TEntry> = (
  a: RegistrySlot<TEntry>,
  b: RegistrySlot<TEntry>,
) => number;

export interface RegistryOptions<TEntry> {
  /** Derives the registry key (id) from an entry. */
  readonly keyOf: (entry: TEntry) => string;
  /**
   * Optional stable comparator applied by `entries()`. Omit to keep insertion
   * order. Implementations should tie-break on `registeredAt` for determinism.
   */
  readonly compare?: RegistryComparator<TEntry>;
}

/**
 * Shared slot-based registry powering the kernel's widget/preview/wallpaper/
 * desktop catalogs. Centralizes the behavior those registries used to copy:
 *
 * - UPSERT on re-register that preserves the original insertion slot.
 * - Identity-checked disposers — a stale disposer never removes a replacement.
 * - Optional stable sort via `compare`.
 * - A test-only `__resetForTests` escape hatch.
 *
 * Concrete registries extend this and layer their own `list(filter)` /
 * `resolve()` on top of the protected `entries()` snapshot.
 */
export class Registry<TEntry> {
  private readonly slots = new Map<string, RegistrySlot<TEntry>>();
  private nextRegistrationOrder = 0;
  private readonly keyOf: (entry: TEntry) => string;
  private readonly compare: RegistryComparator<TEntry> | undefined;

  constructor(options: RegistryOptions<TEntry>) {
    this.keyOf = options.keyOf;
    this.compare = options.compare;
  }

  register(entry: TEntry): () => void {
    const id = this.keyOf(entry);
    const existing = this.slots.get(id);
    const registeredAt = existing?.registeredAt ?? this.nextRegistrationOrder++;

    this.slots.set(id, { entry, registeredAt });

    return (): void => {
      const current = this.slots.get(id);
      if (current?.entry === entry) {
        this.slots.delete(id);
      }
    };
  }

  unregister(id: string): boolean {
    return this.slots.delete(id);
  }

  has(id: string): boolean {
    return this.slots.has(id);
  }

  get(id: string): TEntry | undefined {
    return this.slots.get(id)?.entry;
  }

  /**
   * Sorted (or insertion-order) snapshot of registered entries. Returned
   * mutable on purpose so subclasses can filter then `Object.freeze` the public
   * result.
   */
  protected entries(): TEntry[] {
    const slots = Array.from(this.slots.values());
    if (this.compare !== undefined) {
      slots.sort(this.compare);
    }
    return slots.map((slot) => slot.entry);
  }

  /**
   * Test-only escape hatch for resetting the registry between test cases
   * without spinning up a fresh kernel. Production code MUST NOT call this —
   * registry teardown is the kernel's responsibility (managed via
   * `kernel.dispose`). Resets the registration counter so id ordering after a
   * reset is deterministic.
   */
  __resetForTests(): void {
    this.slots.clear();
    this.nextRegistrationOrder = 0;
  }
}
