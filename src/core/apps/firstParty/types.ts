import type {
  AppChromeManifest,
  AppPermission,
  AppSettingsManifest,
  WindowDefaults,
} from "~/types/app";
import type { AppPreviewSurface } from "~/types/preview";
import type { ShellId } from "~/types/shell";
import type { DesktopContextMenuSurface, DesktopRendererSurface } from "~/types/desktop";
import type { WidgetDefaultPlacement, WidgetSize, WidgetSurface } from "~/types/widget";

import type { FirstPartyPreviewMatchRule } from "./previewMatchers";

export interface FirstPartyCatalogWidgetDescriptor {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  /**
   * App-owned icon shipped with the app release, referenced by a relative
   * filename (e.g. `"widget-icon.svg"`). The host resolves it against the
   * entry module's directory into a trusted, release-pinned URL.
   */
  readonly icon?: string;
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
  /**
   * App-owned, serializable rule describing what this preview matches. Evaluated
   * synchronously by the shell (no app module load) — see
   * {@link FirstPartyPreviewMatchRule}.
   */
  readonly match: FirstPartyPreviewMatchRule;
}

export interface FirstPartyCatalogDesktopContextMenuDescriptor {
  readonly id: string;
  readonly label: string;
  readonly surface: DesktopContextMenuSurface;
  readonly group?: string;
  readonly order?: number;
  /** Named export in the app entry module that is this action function. */
  readonly exportName: string;
}

export interface FirstPartyCatalogDesktopRendererDescriptor {
  readonly id: string;
  readonly surface: DesktopRendererSurface;
  readonly order?: number;
  /** Named export in the app entry module that is this renderer component. */
  readonly exportName: string;
}

export interface FirstPartyCatalogDesktopManifest {
  readonly contextMenu?: readonly FirstPartyCatalogDesktopContextMenuDescriptor[];
  readonly renderers?: readonly FirstPartyCatalogDesktopRendererDescriptor[];
}

export interface FirstPartyCatalogAppManifest {
  readonly id: string;
  readonly name: string;
  /**
   * App-owned identity icon shipped with the app release, referenced by a
   * relative filename (e.g. `"icon.svg"`). The host resolves it against the
   * entry module's directory into a trusted, release-pinned URL and renders it
   * as an image, so apps own their visual identity without a shell code change.
   */
  readonly icon: string;
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
  readonly desktop?: FirstPartyCatalogDesktopManifest;
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
  /** Release-pinned module URL, e.g. `/_api/public/apps/notes/1.0.0+123/notes.js`. */
  readonly entry: string;
  /**
   * Serializable app metadata. Optional only for legacy v1 catalog entries;
   * runtime registration skips entries without a validated manifest.
   */
  readonly manifest?: FirstPartyCatalogAppManifest;
}

/** The `/_api/public/apps/index.json` document: the dynamic id -> entry-URL mapping. */
export interface FirstPartyCatalog {
  readonly apps: readonly FirstPartyCatalogEntry[];
}
