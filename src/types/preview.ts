import type { Component } from "vue";

import type { VfsDirEntry } from "~/core/vfs/nodes";

export type AppPreviewSurface = "blog.embed" | "finder.panel" | "movies.trailer";

export interface AppPreviewUrlInput {
  readonly kind: "url";
  readonly url: string;
}

export interface AppPreviewVfsFileInput {
  readonly kind: "vfs-file";
  readonly entry: VfsDirEntry;
}

export type AppPreviewInput = AppPreviewUrlInput | AppPreviewVfsFileInput;

export interface AppPreviewComponentProps {
  readonly input: AppPreviewInput;
  readonly args: Readonly<Record<string, unknown>>;
  readonly surface: AppPreviewSurface;
}

export interface AppPreviewMatch {
  readonly args?: Readonly<Record<string, unknown>>;
}

export interface AppPreviewProvider {
  readonly id: string;
  readonly manifestId: string;
  readonly title?: string;
  readonly surfaces: readonly AppPreviewSurface[];
  readonly priority?: number;
  readonly component: () => Promise<{ default: Component }>;
  match(input: AppPreviewInput, surface: AppPreviewSurface): AppPreviewMatch | null;
}

export interface AppPreviewResolution {
  readonly provider: AppPreviewProvider;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface AppPreviewListFilter {
  readonly surface?: AppPreviewSurface;
}

export interface KernelPreviewsFacade {
  register(provider: AppPreviewProvider): () => void;
  unregister(id: string): void;
  list(filter?: AppPreviewListFilter): readonly AppPreviewProvider[];
  get(id: string): AppPreviewProvider | undefined;
  resolve(
    input: AppPreviewInput,
    filter: { readonly surface: AppPreviewSurface },
  ): AppPreviewResolution | null;
}
