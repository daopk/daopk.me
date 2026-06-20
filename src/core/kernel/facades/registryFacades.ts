import type { DesktopContextMenuRegistry } from "~/core/kernel/DesktopContributionRegistry";
import type { DesktopRendererRegistry } from "~/core/kernel/DesktopContributionRegistry";
import type { EventBus } from "~/core/kernel/EventBus";
import type { PreviewRegistry } from "~/core/kernel/PreviewRegistry";
import { makeRegistryFacade } from "~/core/kernel/registryHelpers";
import type { WallpaperRegistry } from "~/core/kernel/WallpaperRegistry";
import type { WidgetRegistry } from "~/core/kernel/WidgetRegistry";
import type { Kernel } from "~/types/kernel";

export interface RegistryFacadeDeps {
  readonly bus: EventBus;
  readonly widgets: WidgetRegistry;
  readonly previews: PreviewRegistry;
  readonly desktopContextMenu: DesktopContextMenuRegistry;
  readonly desktopRenderers: DesktopRendererRegistry;
  readonly wallpapers: WallpaperRegistry;
}

/**
 * Builds the registry-backed kernel surfaces (widgets, previews, desktop
 * contributions, wallpapers). Each wraps its catalog with
 * {@link makeRegistryFacade}, emitting the matching `<x>.registered` /
 * `<x>.unregistered` events on the shared bus.
 */
export function createRegistryFacades(
  deps: RegistryFacadeDeps,
): Pick<Kernel, "widgets" | "previews" | "desktop" | "wallpapers"> {
  const { bus } = deps;

  return {
    widgets: makeRegistryFacade(deps.widgets, {
      onRegistered: (id) => bus.emit("widget.registered", { id }),
      onUnregistered: (id) => bus.emit("widget.unregistered", { id }),
    }),

    previews: {
      ...makeRegistryFacade(deps.previews, {
        onRegistered: (id) => bus.emit("preview.registered", { id }),
        onUnregistered: (id) => bus.emit("preview.unregistered", { id }),
      }),

      resolve(input, filter) {
        return deps.previews.resolve(input, filter);
      },
    },

    desktop: {
      contextMenu: makeRegistryFacade(deps.desktopContextMenu, {
        onRegistered: (id) => bus.emit("desktop.context-menu.registered", { id }),
        onUnregistered: (id) => bus.emit("desktop.context-menu.unregistered", { id }),
      }),

      renderers: makeRegistryFacade(deps.desktopRenderers, {
        onRegistered: (id) => bus.emit("desktop.renderer.registered", { id }),
        onUnregistered: (id) => bus.emit("desktop.renderer.unregistered", { id }),
      }),
    },

    wallpapers: makeRegistryFacade(deps.wallpapers, {
      onRegistered: (id) => bus.emit("wallpaper.registered", { id }),
      onUnregistered: (id) => bus.emit("wallpaper.unregistered", { id }),
    }),
  };
}
