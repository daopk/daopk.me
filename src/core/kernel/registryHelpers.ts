import type { AppManifest } from "~/types/app";
import type {
  DesktopContextMenuItemManifest,
  DesktopRendererManifest,
  KernelDesktopContextMenuFacade,
  KernelDesktopRenderersFacade,
} from "~/types/desktop";
import type { AppPreviewProvider, KernelPreviewsFacade } from "~/types/preview";
import type { KernelWallpapersFacade } from "~/types/wallpaper";
import type { KernelWidgetsFacade, WidgetManifest } from "~/types/widget";
import type { Wallpaper } from "~/core/theme/wallpapers";

export function disposeAppWidgets(
  disposers: Map<string, Array<() => void>>,
  manifestId: string,
  onError?: (error: unknown) => void,
): void {
  const disposersForApp = disposers.get(manifestId);
  if (!disposersForApp) {
    return;
  }
  disposers.delete(manifestId);
  for (const dispose of disposersForApp) {
    try {
      dispose();
    } catch (error) {
      onError?.(error);
    }
  }
}

export function registerAppWidgets({
  disposers,
  manifest,
  onDisposeError,
  onInvalidNamespace,
  widgets,
}: {
  readonly disposers: Map<string, Array<() => void>>;
  readonly onDisposeError?: (error: unknown) => void;
  readonly onInvalidNamespace?: (widgetId: string) => void;
  readonly manifest: AppManifest;
  readonly widgets: KernelWidgetsFacade;
}): void {
  disposeAppWidgets(disposers, manifest.id, onDisposeError);

  const appWidgets = manifest.widgets ?? [];
  if (appWidgets.length === 0) {
    return;
  }

  const namespace = `${manifest.id}:`;
  const nextDisposers: Array<() => void> = [];
  for (const widget of appWidgets) {
    if (!widget.id.startsWith(namespace)) {
      onInvalidNamespace?.(widget.id);
      continue;
    }

    const appWidget: WidgetManifest = {
      ...widget,
      icon: widget.icon ?? manifest.icon,
      defaultVisible: widget.defaultVisible ?? false,
    };
    nextDisposers.push(widgets.register(appWidget));
  }

  if (nextDisposers.length > 0) {
    disposers.set(manifest.id, nextDisposers);
  }
}

export function disposeAppPreviews(
  disposers: Map<string, Array<() => void>>,
  manifestId: string,
  onError?: (error: unknown) => void,
): void {
  const disposersForApp = disposers.get(manifestId);
  if (!disposersForApp) {
    return;
  }
  disposers.delete(manifestId);
  for (const dispose of disposersForApp) {
    try {
      dispose();
    } catch (error) {
      onError?.(error);
    }
  }
}

export function disposeAppDesktopContributions(
  disposers: Map<string, Array<() => void>>,
  manifestId: string,
  onError?: (error: unknown) => void,
): void {
  const disposersForApp = disposers.get(manifestId);
  if (!disposersForApp) {
    return;
  }
  disposers.delete(manifestId);
  for (const dispose of disposersForApp) {
    try {
      dispose();
    } catch (error) {
      onError?.(error);
    }
  }
}

export function registerAppDesktopContributions({
  contextMenu,
  disposers,
  manifest,
  onDisposeError,
  onInvalidNamespace,
  renderers,
}: {
  readonly disposers: Map<string, Array<() => void>>;
  readonly onDisposeError?: (error: unknown) => void;
  readonly onInvalidNamespace?: (contributionId: string) => void;
  readonly manifest: AppManifest;
  readonly contextMenu: KernelDesktopContextMenuFacade;
  readonly renderers: KernelDesktopRenderersFacade;
}): void {
  disposeAppDesktopContributions(disposers, manifest.id, onDisposeError);

  const desktop = manifest.desktop;
  if (
    desktop === undefined ||
    ((desktop.contextMenu?.length ?? 0) === 0 && (desktop.renderers?.length ?? 0) === 0)
  ) {
    return;
  }

  const namespace = `${manifest.id}:`;
  const nextDisposers: Array<() => void> = [];

  for (const item of desktop.contextMenu ?? []) {
    if (!item.id.startsWith(namespace)) {
      onInvalidNamespace?.(item.id);
      continue;
    }

    const appItem: DesktopContextMenuItemManifest = {
      ...item,
      manifestId: manifest.id,
    };
    nextDisposers.push(contextMenu.register(appItem));
  }

  for (const renderer of desktop.renderers ?? []) {
    if (!renderer.id.startsWith(namespace)) {
      onInvalidNamespace?.(renderer.id);
      continue;
    }

    const appRenderer: DesktopRendererManifest = {
      ...renderer,
      manifestId: manifest.id,
    };
    nextDisposers.push(renderers.register(appRenderer));
  }

  if (nextDisposers.length > 0) {
    disposers.set(manifest.id, nextDisposers);
  }
}

export function registerAppPreviews({
  disposers,
  manifest,
  onDisposeError,
  onInvalidNamespace,
  previews,
}: {
  readonly disposers: Map<string, Array<() => void>>;
  readonly onDisposeError?: (error: unknown) => void;
  readonly onInvalidNamespace?: (previewId: string) => void;
  readonly manifest: AppManifest;
  readonly previews: KernelPreviewsFacade;
}): void {
  disposeAppPreviews(disposers, manifest.id, onDisposeError);

  const appPreviews = manifest.previews ?? [];
  if (appPreviews.length === 0) {
    return;
  }

  const namespace = `${manifest.id}:`;
  const nextDisposers: Array<() => void> = [];
  for (const preview of appPreviews) {
    if (!preview.id.startsWith(namespace)) {
      onInvalidNamespace?.(preview.id);
      continue;
    }

    const appPreview: AppPreviewProvider = {
      ...preview,
      manifestId: manifest.id,
    };
    nextDisposers.push(previews.register(appPreview));
  }

  if (nextDisposers.length > 0) {
    disposers.set(manifest.id, nextDisposers);
  }
}

export function seedBuiltinWallpapers(
  wallpapers: KernelWallpapersFacade,
  builtins: readonly Wallpaper[],
): void {
  for (const wallpaper of builtins) {
    wallpapers.register({
      id: wallpaper.id,
      name: wallpaper.name,
      type: wallpaper.type,
      value: wallpaper.value,
      ...(wallpaper.valueByShell === undefined ? {} : { valueByShell: wallpaper.valueByShell }),
      ...(wallpaper.preferredTheme === undefined
        ? {}
        : { preferredTheme: wallpaper.preferredTheme }),
    });
  }
}
