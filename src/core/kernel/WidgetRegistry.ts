import { Registry } from "~/core/kernel/Registry";
import type { WidgetListFilter, WidgetManifest } from "~/types/widget";

const DEFAULT_PRIORITY = 100;

export class WidgetRegistry extends Registry<WidgetManifest> {
  constructor() {
    super({
      keyOf: (manifest) => manifest.id,
      compare: (a, b) => {
        const priorityA = a.entry.priority ?? DEFAULT_PRIORITY;
        const priorityB = b.entry.priority ?? DEFAULT_PRIORITY;
        if (priorityA !== priorityB) {
          return priorityB - priorityA;
        }
        return a.registeredAt - b.registeredAt;
      },
    });
  }

  list(filter?: WidgetListFilter): readonly WidgetManifest[] {
    const list = this.entries();

    if (filter?.surface === undefined) {
      return Object.freeze(list);
    }

    const surface = filter.surface;
    return Object.freeze(
      list.filter((manifest) => manifest.surface === "any" || manifest.surface === surface),
    );
  }
}
