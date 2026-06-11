import type {
  AppChromeManifest,
  AppPermission,
  AppSettingsManifest,
  WindowDefaults,
} from "~/types/app";
import type { AppPreviewProvider, AppPreviewSurface } from "~/types/preview";
import type { ShellId } from "~/types/shell";
import type {
  WidgetDefaultPlacement,
  WidgetManifest,
  WidgetSize,
  WidgetSurface,
} from "~/types/widget";

import type { FirstPartyIconKey } from "./iconResolver";
import type { FirstPartyPreviewMatcherKey } from "./previewMatchers";

export interface FirstPartyCatalogWidgetDescriptor {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly icon?: FirstPartyIconKey;
  readonly surface: WidgetSurface;
  readonly size: WidgetSize;
  readonly defaultVisible?: boolean;
  readonly priority?: number;
  readonly defaultPlacement?: WidgetDefaultPlacement;
  /** Named export in the app entry module that is this widget's component. */
  readonly exportName: string;
}

export interface FirstPartyCatalogPreviewDescriptor {
  readonly id: string;
  readonly title?: string;
  readonly surfaces: readonly AppPreviewSurface[];
  readonly priority?: number;
  /** Named export in the app entry module that is this preview component. */
  readonly exportName: string;
  /** Host-owned matcher key; matcher functions stay in the shell runtime. */
  readonly match: FirstPartyPreviewMatcherKey;
}

export interface FirstPartyCatalogAppManifest {
  readonly id: string;
  readonly name: string;
  readonly icon: FirstPartyIconKey;
  readonly category: "system" | "productivity" | "media" | "dev" | "other";
  readonly singleton?: boolean;
  readonly hidden?: boolean;
  readonly autorun?: boolean;
  readonly supportedShells?: readonly ShellId[];
  readonly permissions?: readonly AppPermission[];
  readonly defaultWindow?: WindowDefaults;
  readonly chrome?: AppChromeManifest;
  readonly keywords?: readonly string[];
  readonly settings?: AppSettingsManifest;
  readonly widgets?: readonly FirstPartyCatalogWidgetDescriptor[];
  readonly previews?: readonly FirstPartyCatalogPreviewDescriptor[];
}

/** One published app in the catalog: manifest metadata + immutable module URL. */
export interface FirstPartyCatalogEntry {
  readonly id: string;
  /** Manual, user-facing semver from the app package.json. */
  readonly version: string;
  /** Automatic publish build number. Missing legacy catalog values normalize to 0. */
  readonly build: number;
  /** Optional short source revision for tracing the published bundle. */
  readonly revision?: string;
  /** Release-pinned module URL, e.g. `/apps/notes/1.0.0+123/notes.js`. */
  readonly entry: string;
  /**
   * Serializable app metadata. Optional only for legacy v1 catalog entries;
   * runtime registration skips entries without a validated manifest.
   */
  readonly manifest?: FirstPartyCatalogAppManifest;
}

/** The `/apps/index.json` document: the dynamic id -> entry-URL mapping. */
export interface FirstPartyCatalog {
  readonly apps: readonly FirstPartyCatalogEntry[];
}

export type FirstPartyRuntimeWidgetDescriptor = Omit<
  FirstPartyCatalogWidgetDescriptor,
  "exportName" | "icon"
> &
  Pick<WidgetManifest, "component"> & {
    readonly icon?: WidgetManifest["icon"];
  };

export type FirstPartyRuntimePreviewDescriptor = Omit<
  FirstPartyCatalogPreviewDescriptor,
  "exportName" | "match"
> &
  Pick<AppPreviewProvider, "component" | "match">;
