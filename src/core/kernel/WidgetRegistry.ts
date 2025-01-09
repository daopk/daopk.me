import type { WidgetListFilter, WidgetManifest } from "~/types/widget";

interface WidgetSlot {
  manifest: WidgetManifest;
  registeredAt: number;
}

const DEFAULT_PRIORITY = 100;

export class WidgetRegistry {
  private readonly slots = new Map<string, WidgetSlot>();
  private nextRegistrationOrder = 0;

  register(manifest: WidgetManifest): () => void {
    const existing = this.slots.get(manifest.id);
    const registeredAt = existing?.registeredAt ?? this.nextRegistrationOrder++;

    this.slots.set(manifest.id, { manifest, registeredAt });

    return (): void => {
      const current = this.slots.get(manifest.id);
      if (current?.manifest === manifest) {
        this.slots.delete(manifest.id);
      }
    };
  }

  unregister(id: string): boolean {
    return this.slots.delete(id);
  }

  has(id: string): boolean {
    return this.slots.has(id);
  }

  get(id: string): WidgetManifest | undefined {
    return this.slots.get(id)?.manifest;
  }

  list(filter?: WidgetListFilter): readonly WidgetManifest[] {
    const sorted = Array.from(this.slots.values()).sort((a, b) => {
      const priorityA = a.manifest.priority ?? DEFAULT_PRIORITY;
      const priorityB = b.manifest.priority ?? DEFAULT_PRIORITY;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      return a.registeredAt - b.registeredAt;
    });

    const list = sorted.map((slot) => slot.manifest);

    if (filter?.surface === undefined) {
      return Object.freeze(list);
    }

    const surface = filter.surface;
    return Object.freeze(
      list.filter((manifest) => manifest.surface === "any" || manifest.surface === surface),
    );
  }

  /**
   * Test-only escape hatch for resetting the registry between test
   * cases without spinning up a fresh kernel. Production code MUST
   * NOT call this — registry teardown is the kernel's responsibility
   * (managed via `kernel.dispose`). Resets the registration counter
   * so id ordering after a reset is deterministic.
   */
  __resetForTests(): void {
    this.slots.clear();
    this.nextRegistrationOrder = 0;
  }
}
