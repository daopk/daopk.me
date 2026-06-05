import type {
  AppPreviewInput,
  AppPreviewListFilter,
  AppPreviewProvider,
  AppPreviewResolution,
  AppPreviewSurface,
} from "~/types/preview";

interface PreviewSlot {
  readonly provider: AppPreviewProvider;
  readonly registeredAt: number;
}

const DEFAULT_PRIORITY = 100;

export class PreviewRegistry {
  private readonly slots = new Map<string, PreviewSlot>();
  private nextRegistrationOrder = 0;

  register(provider: AppPreviewProvider): () => void {
    const existing = this.slots.get(provider.id);
    const registeredAt = existing?.registeredAt ?? this.nextRegistrationOrder++;

    this.slots.set(provider.id, { provider, registeredAt });

    return (): void => {
      const current = this.slots.get(provider.id);
      if (current?.provider === provider) {
        this.slots.delete(provider.id);
      }
    };
  }

  unregister(id: string): boolean {
    return this.slots.delete(id);
  }

  has(id: string): boolean {
    return this.slots.has(id);
  }

  get(id: string): AppPreviewProvider | undefined {
    return this.slots.get(id)?.provider;
  }

  list(filter?: AppPreviewListFilter): readonly AppPreviewProvider[] {
    const sorted = Array.from(this.slots.values()).sort((a, b) => {
      const priorityA = a.provider.priority ?? DEFAULT_PRIORITY;
      const priorityB = b.provider.priority ?? DEFAULT_PRIORITY;
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      return a.registeredAt - b.registeredAt;
    });

    const list = sorted.map((slot) => slot.provider);

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

  __resetForTests(): void {
    this.slots.clear();
    this.nextRegistrationOrder = 0;
  }
}

function supportsSurface(provider: AppPreviewProvider, surface: AppPreviewSurface): boolean {
  return provider.surfaces.includes(surface);
}
