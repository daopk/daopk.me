import type { InjectionKey, Ref, ShallowRef } from "vue";

import type { LifecyclePhase } from "~/core/kernel/Lifecycle";
import type { VfsDirEntry, VfsNodeKind, VfsStat } from "~/core/vfs";
import { KernelInjectionKey as rawKernelInjectionKey } from "~/runtime/injectionKeys";
import type { AppHandle, AppManifest, AppPermission } from "~/types/app";
import type { CommandSource, KernelCommandsFacade } from "~/types/command";
import type {
  PermissionDecision,
  PermissionLedgerEntry,
  PermissionRequestSource,
  PermissionResponseInput,
} from "~/types/permissions";
import type { KernelPreviewsFacade } from "~/types/preview";
import type { ActiveProfileSession, ProfileSessionSnapshot } from "~/types/profile";
import type { KernelSearchFacade } from "~/types/search";
import type { SettingsSectionId, SettingsState } from "~/types/settings";
import type { DeviceProfile, ShellId } from "~/types/shell";
import type { KernelTelemetryFacade } from "~/types/telemetry";
import type { ResolvedTheme, ThemeName } from "~/types/theme";
import type { TrashChangePayload, KernelTrashFacade } from "~/types/trash";
import type { KernelWallpapersFacade } from "~/types/wallpaper";
import type { KernelWidgetsFacade } from "~/types/widget";

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

export interface KernelProcessesFacade {
  spawn(_manifestId: string, _args?: Record<string, unknown>): AppHandle;
  kill(_handleId: string, _reason?: "user" | "shell" | "kernel"): void;
  /**
   * Flip a process to `"suspended"`. Mobile shells call this when
   * a frame leaves the foreground; the desktop window manager will call
   * it once a "minimized" affordance ships. Idempotent — a no-op call
   * (already suspended, or unknown handle) emits no `lifecycle.suspended`.
   */
  suspend(_handleId: string): void;
  resume(_handleId: string): void;
  list(): IterableIterator<
    [
      string,
      {
        state: string;
        manifestId: string;
        args?: Readonly<Record<string, unknown>>;
      },
    ]
  >;
}

export interface KernelLifecycleCoordinatorFacade {
  register(_handle: AppHandle): void;
  unregister(_handleId: string): void;
  emit(_phase: LifecyclePhase, _handleId: string): void;
  /**
   * Subscribe a callback to a phase for `handleId`. Mirrors the internal
   * `Lifecycle.on` contract — listeners attached BEFORE `register` are
   * dropped with a dev-time warning, so callers must sequence
   * `register → on → emit`. Returns an unsubscribe fn. Promoted to the
   * façade in so `useAppLifecycle` and future devtools panels can
   * subscribe without reaching into kernel internals.
   */
  on(_phase: LifecyclePhase, _handleId: string, _callback: () => void): () => void;
}

export type AppRegistrationSource = "system" | "external";

export interface KernelAppsRegisterOptions {
  readonly source?: AppRegistrationSource;
}

export interface KernelAppsFacade {
  register(manifest: AppManifest, options?: KernelAppsRegisterOptions): void;
  launch(id: string, args?: Readonly<Record<string, unknown>>): Promise<AppHandle>;
  unregister(id: string): void;
  list(filter?: { category?: AppManifest["category"] }): AppManifest[];
}

export interface KernelEventsFacade {
  emit<K extends keyof KernelEventMap>(channel: K, payload: KernelEventMap[K]): void;

  on<K extends keyof KernelEventMap>(
    channel: K,
    listener: (payload: KernelEventMap[K]) => void,
  ): () => void;

  once<K extends keyof KernelEventMap>(
    channel: K,
    listener: (payload: KernelEventMap[K]) => void,
  ): () => void;

  off<K extends keyof KernelEventMap>(
    channel: K,
    listener: (payload: KernelEventMap[K]) => void,
  ): void;
}

export interface KernelSettingsFacade {
  use<K extends keyof SettingsState>(key: K): Ref<SettingsState[K]>;
  get<K extends keyof SettingsState>(key: K): SettingsState[K];
  set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void;
  reset(): void;
}

export interface KernelVfsAccessOptions {
  readonly handleId: string;
}

export interface KernelVfsWriteOptions extends KernelVfsAccessOptions {
  readonly overwrite?: boolean;
  readonly mimeType?: string;
}

export interface KernelVfsDirectoryOptions extends KernelVfsAccessOptions {
  readonly recursive?: boolean;
}

export interface KernelVfsFacade {
  stat(_path: string, _options: KernelVfsAccessOptions): Promise<VfsStat | null>;
  list(_path: string, _options: KernelVfsAccessOptions): Promise<readonly VfsDirEntry[] | null>;
  read(_path: string, _options: KernelVfsAccessOptions): Promise<Uint8Array | null>;
  readText(_path: string, _options: KernelVfsAccessOptions): Promise<string | null>;
  write(
    _path: string,
    _bytes: Uint8Array,
    _options: KernelVfsWriteOptions,
  ): Promise<VfsStat | null>;
  writeText(_path: string, _text: string, _options: KernelVfsWriteOptions): Promise<VfsStat | null>;
  mkdir(_path: string, _options: KernelVfsDirectoryOptions): Promise<VfsStat | null>;
  remove(_path: string, _options: KernelVfsDirectoryOptions): Promise<boolean>;
}

export interface KernelBackgroundFacade {
  run<Result = unknown>(_jobId: string, input: Record<string, unknown>): Promise<Result>;
}

export interface KernelProfileFacade {
  current(): ProfileSessionSnapshot;
  lock(): Promise<void>;
  unlock(_session?: ActiveProfileSession): void;
  signOut(): Promise<void>;
  deleteCurrentAccount(): Promise<void>;
  isLocked(): boolean;
  useLocked(): Readonly<ShallowRef<boolean>>;
}

export interface KernelThemeFacade {
  current(): ResolvedTheme;

  setTheme(name: SettingsState["theme"]): void;
  subscribe(listener: (theme: ResolvedTheme) => void): () => void;
  list(): readonly ThemeName[];
  currentOverrides(): Readonly<Record<string, string>>;
  setOverride(cssVar: string, value: string): void;
  unsetOverride(cssVar: string): void;
  setOverrides(patch: Readonly<Record<string, string>>): void;
  resetOverrides(): void;
}

export interface KernelShortcutsFacade {
  register(_sequence: string, _handler: (event: KeyboardEvent) => void): () => void;
}

export interface KernelNotificationsFacade {
  enqueue(toast: Record<string, unknown>, options: { manifestId: string }): Promise<string | null>;
}

export interface KernelPermissionsFacade {
  request(
    manifestId: string,
    permission: AppPermission,
    options?: { source?: PermissionRequestSource },
  ): Promise<PermissionDecision>;
  /**
   * Resolve a parked request. Only the active shell's `permissionPrompt/`
   * host should call this — `requestId` is the opaque id from the
   * `permission.requested` event. Returns `false` if `requestId` is
   * unknown (already resolved, stale across HMR, etc.) — a silent drop
   * with a dev-warn keeps stale prompts from crashing.
   */
  respond(requestId: string, response: PermissionResponseInput): boolean;
  revoke(manifestId: string, permission: AppPermission): boolean;
  list(filter?: { manifestId?: string }): readonly PermissionLedgerEntry[];
}

export type BootStatus =
  | "idle"
  | "running"
  | "complete"
  | "failed"
  /** AbortSignal-driven teardown (e.g. HMR dispose); not a boot failure. */
  | "cancelled";

export interface KernelBootFacade {
  status: BootStatus;

  progressFraction: number;

  phaseLabel: string;

  /**
   * The error that caused the most recent phase failure, or `null` when the
   * boot is idle/running/complete. Set when `status` becomes `"failed"` and
   * cleared on the next run and on `reset()`, letting the boot UI surface the
   * actual cause instead of a generic message.
   */
  error: Error | null;
  scheduleIdleAfterShellReady(cb: () => void): () => void;
}

export interface Kernel {
  init(): Promise<void>;
  dispose(): void;
  readonly processes: KernelProcessesFacade;
  readonly lifecycleCoordinator: KernelLifecycleCoordinatorFacade;
  readonly boot: KernelBootFacade;
  readonly apps: KernelAppsFacade;
  readonly commands: KernelCommandsFacade;
  readonly events: KernelEventsFacade;
  readonly settings: KernelSettingsFacade;
  readonly vfs: KernelVfsFacade;
  readonly background: KernelBackgroundFacade;
  readonly profile: KernelProfileFacade;
  readonly telemetry: KernelTelemetryFacade;
  readonly theme: KernelThemeFacade;
  readonly shortcuts: KernelShortcutsFacade;
  readonly notifications: KernelNotificationsFacade;
  readonly trash: KernelTrashFacade;
  readonly permissions: KernelPermissionsFacade;
  readonly search: KernelSearchFacade;
  readonly widgets: KernelWidgetsFacade;
  readonly previews: KernelPreviewsFacade;
  readonly wallpapers: KernelWallpapersFacade;
}

// Defined once in the runtime symbol module so the host and published
// first-party apps share the same symbol instance.
export const KernelInjectionKey = rawKernelInjectionKey as InjectionKey<Kernel>;
