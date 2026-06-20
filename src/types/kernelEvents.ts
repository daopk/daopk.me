import type { AppPermission } from "~/types/app";
import type { CommandSource } from "~/types/command";
import type { SettingsSectionId, SettingsState } from "~/types/settings";
import type { DeviceProfile, ShellId } from "~/types/shell";
import type { ResolvedTheme } from "~/types/theme";
import type { TrashChangePayload } from "~/types/trash";
import type { VfsNodeKind } from "~/core/vfs";

declare global {
  interface KernelEventPayloads {
    "shell.changed": { shellId: ShellId; profile: DeviceProfile };
    "app.launched": {
      manifestId: string;
      handleId: string;
      reusedExisting: boolean;
    };
    /**
     * Emitted by `kernel.processes.kill` BEFORE `ProcessTable.kill` removes
     * the handle. Consumers with synchronous teardown work that still needs a
     * live process identity, such as app-scoped VFS autosave, should start it
     * here. `app.killed` remains the post-removal notification.
     */
    "app.will-kill": {
      manifestId: string;
      handleId: string;
      reason: "user" | "shell" | "kernel";
      /**
       * Registers async teardown work that must finish before the process
       * handle is removed. Consumers should call this synchronously inside
       * the event listener.
       */
      waitUntil: (promise: Promise<unknown>) => void;
    };
    "app.killed": {
      manifestId: string;
      handleId: string;
      reason: "user" | "shell" | "kernel";
    };
    "app.settings.requested": {
      manifestId: string;
      handleId?: string;
    };
    "settings.changed": { key: keyof SettingsState };
    "settings.synced": { source: "storage" };
    "settings.section.requested": { section: SettingsSectionId };
    "blog.open.requested": {
      source: "dock" | "menu" | "shortcut" | "spotlight" | "terminal" | "api" | "deeplink";
      path?: string;
      slug?: string;
    };
    "youtube-player.open.requested": {
      source: "dock" | "menu" | "shortcut" | "spotlight" | "terminal" | "api" | "deeplink";
      autoplay?: boolean;
      handleId?: string;
      videoId?: string;
      url?: string;
    };
    "blog.post.open.requested": {
      source: CommandSource;
      path: string;
      slug: string;
    };
    "notes.open.requested": {
      source: "dock" | "menu" | "shortcut" | "spotlight" | "terminal" | "api" | "deeplink";
      path: string;
    };
    "pdf-viewer.open.requested": {
      source: CommandSource;
      path: string;
    };
    "editor.open.requested": {
      source: CommandSource;
      path: string;
    };
    "editor.window.open.requested": {
      handleId: string;
      path: string;
    };
    "app.document.changed": {
      manifestId: string;
      handleId: string;
      path: string | null;
    };
    "app.url.changed": {
      manifestId: string;
      handleId: string;
      path: string | null;
    };
    "theme.changed": { theme: ResolvedTheme };
    "app.launch.requested": {
      manifestId: string;
      source: "dock" | "menu" | "shortcut" | "spotlight" | "terminal" | "api" | "deeplink";
      /**
       * Optional launch payload. Emitters MUST omit this field
       * entirely (not `args: undefined`, not `args: {}`) when no args
       * are present, so strict `toHaveBeenCalledWith({manifestId, source})`
       * assertions stay green for the args-less callers (dock click,
       * spotlight pick without payload, etc.).
       */
      args?: Readonly<Record<string, unknown>>;
    };
    /**
     * Requests that the active shell open its Spotlight surface. Unlike
     * `app.launch.requested`, this is intentionally windowless: Spotlight is
     * shell chrome that can be invoked by dock, shortcuts, or future command
     * surfaces without registering a runnable app process.
     */
    "spotlight.open.requested": {
      source: CommandSource;
    };
    "app.spawn.new": {
      manifestId: string;
      source: "dock" | "menu" | "shortcut" | "spotlight" | "terminal" | "api";
      args?: Readonly<Record<string, unknown>>;
    };
    "command.registered": { id: string };
    "command.unregistered": { id: string };
    "app.registered": { id: string };
    "app.unregistered": { id: string };
    "tokens.changed": { keys: readonly string[]; source: "local" | "sync" };
    "process.errored": {
      handleId: string;
      manifestId: string;
      error: { name: string; message: string };
    };
    "widget.registered": { id: string };
    "widget.unregistered": { id: string };
    "preview.registered": { id: string };
    "preview.unregistered": { id: string };
    "desktop.context-menu.registered": { id: string };
    "desktop.context-menu.unregistered": { id: string };
    "desktop.renderer.registered": { id: string };
    "desktop.renderer.unregistered": { id: string };
    "widget.gallery.open.requested": {
      source: CommandSource;
    };
    "wallpaper.registered": { id: string };
    "wallpaper.unregistered": { id: string };
    "permission.requested": {
      requestId: string;
      manifestId: string;
      permission: AppPermission;
      source: "app" | "settings" | "system";
    };
    "permission.granted": {
      manifestId: string;
      permission: AppPermission;
      persisted: boolean;
    };
    "permission.denied": {
      manifestId: string;
      permission: AppPermission;
      persisted: boolean;
    };
    "permission.revoked": {
      manifestId: string;
      permission: AppPermission;
    };
    "vfs.changed": {
      path: string;
      operation: "write" | "mkdir" | "remove";
      kind?: VfsNodeKind;
    };
    "trash.changed": TrashChangePayload;
    "finder.reveal.requested": {
      path: string;
      reveal?: string;
      source: "dock" | "menu" | "shortcut" | "spotlight" | "terminal" | "api" | "deeplink";
    };
  }
}

export type KernelEventName = keyof KernelEventPayloads;

export type KernelEventMap = {
  [K in KernelEventName]: KernelEventPayloads[K];
};
