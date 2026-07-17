import type { VaporComponent } from "vue";

import type { AppManifest } from "~/types/app";
import type { WidgetManifest, WidgetShellScope, WidgetSize, WidgetSurface } from "~/types/widget";

export type WidgetCatalogProviderKind = "system" | "app" | "plugin";

export interface WidgetCatalogProvider {
  kind: WidgetCatalogProviderKind;
  label: string;
  appId?: string;
}

export interface WidgetCatalogItem {
  manifest: WidgetManifest;
  id: string;
  title: string;
  description: string;
  icon?: VaporComponent;
  provider: WidgetCatalogProvider;
  surface: WidgetSurface;
  surfaceLabel: string;
  sizeLabel: string;
  visible: boolean;
  defaultVisible: boolean;
  desktopPlaceable: boolean;
}

export interface CreateWidgetCatalogItemsOptions {
  widgets: readonly WidgetManifest[];
  apps: readonly AppManifest[];
  isVisible: (manifest: WidgetManifest, defaultVisible: boolean) => boolean;
}

const WIDGET_SIZE_LABEL: Record<WidgetSize, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
};

const WIDGET_SURFACE_LABEL: Record<WidgetSurface, string> = {
  "desktop:wallpaper": "Desktop",
  "desktop:menubar": "Menubar",
  "mobile:widgets": "Mobile",
  any: "Everywhere",
};

const SYSTEM_WIDGET_PREFIXES = ["status:", "desktop:", "mobile:"];

export function widgetDefaultVisible(manifest: WidgetManifest): boolean {
  return manifest.defaultVisible ?? true;
}

export function setWidgetVisible(
  setEnabled: (id: string, value: boolean, defaultVisible?: boolean) => void,
  manifest: WidgetManifest,
  value: boolean,
): void {
  setEnabled(manifest.id, value, widgetDefaultVisible(manifest));
}

export function widgetMatchesSurface(
  manifest: WidgetManifest,
  surface: Exclude<WidgetSurface, "any">,
): boolean {
  return manifest.surface === "any" || manifest.surface === surface;
}

export function widgetShellScopeForSurface(
  surface: Exclude<WidgetSurface, "any">,
): WidgetShellScope {
  return surface.startsWith("mobile:") ? "mobile" : "desktop";
}

export function widgetMatchesShellScope(
  manifest: WidgetManifest,
  scope: WidgetShellScope,
): boolean {
  if (manifest.surface === "any") return true;
  return widgetShellScopeForSurface(manifest.surface) === scope;
}

function widgetIsDesktopPlaceable(manifest: WidgetManifest): boolean {
  return widgetMatchesSurface(manifest, "desktop:wallpaper");
}

export function widgetProvider(
  manifest: WidgetManifest,
  apps: readonly AppManifest[],
): WidgetCatalogProvider {
  const namespaceEnd = manifest.id.indexOf(":");
  const namespace = namespaceEnd > 0 ? manifest.id.slice(0, namespaceEnd) : "";
  const app = namespace ? apps.find((candidate) => candidate.id === namespace) : undefined;

  if (app !== undefined) {
    return { kind: "app", label: `App: ${app.name}`, appId: app.id };
  }

  if (SYSTEM_WIDGET_PREFIXES.some((prefix) => manifest.id.startsWith(prefix))) {
    return { kind: "system", label: "System" };
  }

  return { kind: "plugin", label: "Plugin" };
}

export function createWidgetCatalogItems({
  widgets,
  apps,
  isVisible,
}: CreateWidgetCatalogItemsOptions): readonly WidgetCatalogItem[] {
  return widgets.map((manifest) => {
    const provider = widgetProvider(manifest, apps);
    const defaultVisible = widgetDefaultVisible(manifest);
    const appIcon =
      provider.kind === "app" && provider.appId !== undefined
        ? apps.find((app) => app.id === provider.appId)?.icon
        : undefined;

    return {
      manifest,
      id: manifest.id,
      title: manifest.title,
      description: manifest.description ?? `${WIDGET_SIZE_LABEL[manifest.size]} widget`,
      icon: manifest.icon ?? appIcon,
      provider,
      surface: manifest.surface,
      surfaceLabel: WIDGET_SURFACE_LABEL[manifest.surface],
      sizeLabel: WIDGET_SIZE_LABEL[manifest.size],
      visible: isVisible(manifest, defaultVisible),
      defaultVisible,
      desktopPlaceable: widgetIsDesktopPlaceable(manifest),
    };
  });
}

export function matchesWidgetCatalogQuery(item: WidgetCatalogItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return true;
  }

  return [
    item.title,
    item.description,
    item.id,
    item.provider.label,
    item.surfaceLabel,
    item.sizeLabel,
  ].some((value) => value.toLowerCase().includes(q));
}
