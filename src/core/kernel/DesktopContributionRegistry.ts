import { Registry, type RegistrySlot } from "~/core/kernel/Registry";
import type {
  DesktopContextMenuItemManifest,
  DesktopContextMenuListFilter,
  DesktopRendererListFilter,
  DesktopRendererManifest,
} from "~/types/desktop";

const DEFAULT_ORDER = 100;

function compareByOrder<T extends { order?: number }>(
  a: RegistrySlot<T>,
  b: RegistrySlot<T>,
): number {
  const orderDelta = (a.entry.order ?? DEFAULT_ORDER) - (b.entry.order ?? DEFAULT_ORDER);
  return orderDelta === 0 ? a.registeredAt - b.registeredAt : orderDelta;
}

export class DesktopContextMenuRegistry extends Registry<DesktopContextMenuItemManifest> {
  constructor() {
    super({ keyOf: (item) => item.id, compare: compareByOrder });
  }

  list(filter?: DesktopContextMenuListFilter): readonly DesktopContextMenuItemManifest[] {
    const list = this.entries();
    if (filter?.surface === undefined) {
      return Object.freeze(list);
    }

    return Object.freeze(list.filter((item) => item.surface === filter.surface));
  }
}

export class DesktopRendererRegistry extends Registry<DesktopRendererManifest> {
  constructor() {
    super({ keyOf: (renderer) => renderer.id, compare: compareByOrder });
  }

  list(filter?: DesktopRendererListFilter): readonly DesktopRendererManifest[] {
    const list = this.entries();
    if (filter?.surface === undefined) {
      return Object.freeze(list);
    }

    return Object.freeze(list.filter((renderer) => renderer.surface === filter.surface));
  }
}
