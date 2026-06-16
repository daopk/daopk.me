import type {
  DesktopContextMenuItemManifest,
  DesktopContextMenuListFilter,
  DesktopRendererListFilter,
  DesktopRendererManifest,
} from "~/types/desktop";

interface RegistrySlot<T> {
  manifest: T;
  registeredAt: number;
}

const DEFAULT_ORDER = 100;

function orderFor(
  item: Pick<DesktopContextMenuItemManifest | DesktopRendererManifest, "order">,
): number {
  return item.order ?? DEFAULT_ORDER;
}

export class DesktopContextMenuRegistry {
  private readonly slots = new Map<string, RegistrySlot<DesktopContextMenuItemManifest>>();
  private nextRegistrationOrder = 0;

  register(item: DesktopContextMenuItemManifest): () => void {
    const existing = this.slots.get(item.id);
    const registeredAt = existing?.registeredAt ?? this.nextRegistrationOrder++;

    this.slots.set(item.id, { manifest: item, registeredAt });

    return (): void => {
      const current = this.slots.get(item.id);
      if (current?.manifest === item) {
        this.slots.delete(item.id);
      }
    };
  }

  unregister(id: string): boolean {
    return this.slots.delete(id);
  }

  get(id: string): DesktopContextMenuItemManifest | undefined {
    return this.slots.get(id)?.manifest;
  }

  list(filter?: DesktopContextMenuListFilter): readonly DesktopContextMenuItemManifest[] {
    const items = Array.from(this.slots.values()).sort((a, b) => {
      const orderDelta = orderFor(a.manifest) - orderFor(b.manifest);
      return orderDelta === 0 ? a.registeredAt - b.registeredAt : orderDelta;
    });

    const list = items.map((slot) => slot.manifest);
    if (filter?.surface === undefined) {
      return Object.freeze(list);
    }

    return Object.freeze(list.filter((item) => item.surface === filter.surface));
  }

  __resetForTests(): void {
    this.slots.clear();
    this.nextRegistrationOrder = 0;
  }
}

export class DesktopRendererRegistry {
  private readonly slots = new Map<string, RegistrySlot<DesktopRendererManifest>>();
  private nextRegistrationOrder = 0;

  register(renderer: DesktopRendererManifest): () => void {
    const existing = this.slots.get(renderer.id);
    const registeredAt = existing?.registeredAt ?? this.nextRegistrationOrder++;

    this.slots.set(renderer.id, { manifest: renderer, registeredAt });

    return (): void => {
      const current = this.slots.get(renderer.id);
      if (current?.manifest === renderer) {
        this.slots.delete(renderer.id);
      }
    };
  }

  unregister(id: string): boolean {
    return this.slots.delete(id);
  }

  get(id: string): DesktopRendererManifest | undefined {
    return this.slots.get(id)?.manifest;
  }

  list(filter?: DesktopRendererListFilter): readonly DesktopRendererManifest[] {
    const renderers = Array.from(this.slots.values()).sort((a, b) => {
      const orderDelta = orderFor(a.manifest) - orderFor(b.manifest);
      return orderDelta === 0 ? a.registeredAt - b.registeredAt : orderDelta;
    });

    const list = renderers.map((slot) => slot.manifest);
    if (filter?.surface === undefined) {
      return Object.freeze(list);
    }

    return Object.freeze(list.filter((renderer) => renderer.surface === filter.surface));
  }

  __resetForTests(): void {
    this.slots.clear();
    this.nextRegistrationOrder = 0;
  }
}
