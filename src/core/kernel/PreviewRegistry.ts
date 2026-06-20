import { Registry } from "~/core/kernel/Registry";
import type {
  AppPreviewInput,
  AppPreviewListFilter,
  AppPreviewProvider,
  AppPreviewResolution,
  AppPreviewSurface,
} from "~/types/preview";

const DEFAULT_PRIORITY = 100;

export class PreviewRegistry extends Registry<AppPreviewProvider> {
  constructor() {
    super({
      keyOf: (provider) => provider.id,
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

  list(filter?: AppPreviewListFilter): readonly AppPreviewProvider[] {
    const list = this.entries();

    if (filter?.surface === undefined) {
      return Object.freeze(list);
    }

    const surface = filter.surface;
    return Object.freeze(list.filter((provider) => supportsSurface(provider, surface)));
  }

  resolve(
    input: AppPreviewInput,
    filter: { readonly surface: AppPreviewSurface },
  ): AppPreviewResolution | null {
    for (const provider of this.list({ surface: filter.surface })) {
      const match = provider.match(input, filter.surface);
      if (match === null) {
        continue;
      }

      return {
        provider,
        args: Object.freeze({ ...match.args }),
      };
    }

    return null;
  }
}

function supportsSurface(provider: AppPreviewProvider, surface: AppPreviewSurface): boolean {
  return provider.surfaces.includes(surface);
}
