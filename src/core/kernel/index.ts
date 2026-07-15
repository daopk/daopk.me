import { getActivePinia } from "pinia";
import { effectScope, reactive, watch, type EffectScope } from "vue";

import type { CommandContext } from "~/types/command";
import type { ResolvedTheme } from "~/types/theme";
import type { Kernel, KernelBootFacade } from "~/types/kernel";
import type { SettingsState } from "~/types/settings";

import { resetAutorunLatch } from "~/core/boot/autorun";
import { debugLog, debugWarn } from "~/core/debug";
import { AppLaunchError } from "~/core/kernel/errors";
import { AppRegistry } from "~/core/kernel/AppRegistry";
import { CommandRegistry } from "~/core/kernel/CommandRegistry";
import {
  DesktopContextMenuRegistry,
  DesktopRendererRegistry,
} from "~/core/kernel/DesktopContributionRegistry";
import { registerBuiltinCommands } from "~/core/kernel/builtinCommands";
import { EventBus } from "~/core/kernel/EventBus";
import {
  createRegistryFacades,
  createSettingsFacade,
  createThemeFacade,
} from "~/core/kernel/facades";
import { Lifecycle } from "~/core/kernel/Lifecycle";
import { PermissionLedger } from "~/core/kernel/PermissionLedger";
import { PreviewRegistry } from "~/core/kernel/PreviewRegistry";
import { ProcessTable } from "~/core/kernel/ProcessTable";
import { WallpaperRegistry } from "~/core/kernel/WallpaperRegistry";
import { WidgetRegistry } from "~/core/kernel/WidgetRegistry";
import { createKernelIdleScheduler } from "~/core/kernel/idleScheduler";
import {
  createKernelVfs,
  createKernelVfsFacade,
  createVfsAccessController,
} from "~/core/kernel/kernelVfs";
import {
  disposeAppPreviews,
  disposeAppDesktopContributions,
  disposeAppWidgets,
  registerAppDesktopContributions,
  registerAppPreviews,
  registerAppWidgets,
  seedBuiltinWallpapers,
} from "~/core/kernel/registryHelpers";
import {
  clearActiveProfileSession,
  currentProfileSessionSnapshot,
  ensureActiveProfileSessionForKernel,
  isProfileSessionLocked,
  lockActiveProfileSession,
  unlockActiveProfileSession,
  useProfileSessionLocked,
} from "~/core/profile/ProfileSession";
import { deleteProfileAccount } from "~/core/profile/deleteProfile";
import { profileIdbName, profileKvNamespace } from "~/core/profile/storageScope";
import { usePermissionStore } from "~/core/permissions/PermissionStore";
import { resetInitialAppUrlIntentLatch } from "~/core/routing/appUrlIntents";
import { createSearchAdapter } from "~/core/search/createSearchAdapter";
import type { SearchAdapter } from "~/core/search/SearchAdapter";
import { VfsSearchIndexer } from "~/core/search/VfsSearchIndexer";
import { matchesChord, parseChord } from "~/core/shortcuts/chord";
import { useSpotlightRecentsStore } from "~/core/spotlight/SpotlightRecentsStore";
import { useSettingsStore } from "~/core/storage/SettingsStore";
import { durationSince, nowMs, TelemetryBus } from "~/core/telemetry";
import { ThemeManager } from "~/core/theme/ThemeManager";
import { getSystemPreference, subscribeSystemPreference } from "~/core/theme/systemPreference";
import { useTokenOverridesStore } from "~/core/theme/TokenOverridesStore";
import { builtinWallpapers } from "~/core/theme/wallpapers";
import { TrashManager } from "~/core/trash/TrashManager";
import { useWallpaperStore } from "~/core/wallpaper/WallpaperStore";
import { useWidgetPlacementStore } from "~/core/widgets/WidgetPlacementStore";

const registryCatalog = new AppRegistry();
const bus = new EventBus();
const commandsCatalog = new CommandRegistry();
const wallpapersCatalog = new WallpaperRegistry();
const widgetsCatalog = new WidgetRegistry();
const previewsCatalog = new PreviewRegistry();
const desktopContextMenuCatalog = new DesktopContextMenuRegistry();
const desktopRendererCatalog = new DesktopRendererRegistry();
const appWidgetDisposers = new Map<string, Array<() => void>>();
const appPreviewDisposers = new Map<string, Array<() => void>>();
const appDesktopContributionDisposers = new Map<string, Array<() => void>>();
const lifecycleInternal = new Lifecycle();
const processesInternal = new ProcessTable();
const pendingProcessKills = new Map<string, Promise<void>>();
let notificationIdFallback = 0;
const noopAbortController = new AbortController();
const EMPTY_COMMAND_PAYLOAD = Object.freeze({});
const telemetryInternal = new TelemetryBus({
  isEnabled: () => {
    const pinia = getActivePinia();
    if (!pinia) {
      return false;
    }

    return useSettingsStore(pinia).telemetryEnabled === true;
  },
});

const permissionsInternal = new PermissionLedger({
  isSystemApp: (manifestId) => registryCatalog.isSystemApp(manifestId),
  hasFirstPartyDefaultGrant: (manifestId, permission) =>
    registryCatalog.hasFirstPartyDefaultGrant(manifestId, permission),
  store: {
    get: (manifestId, permission) => usePermissionStore(requirePinia()).get(manifestId, permission),
    set: (manifestId, permission, granted) =>
      usePermissionStore(requirePinia()).set(manifestId, permission, granted),
    remove: (manifestId, permission) =>
      usePermissionStore(requirePinia()).remove(manifestId, permission),
    list: (filter) => usePermissionStore(requirePinia()).list(filter),
  },
  events: {
    emit: ((channel: never, payload: never) => bus.emit(channel, payload)) as never,
  },
});

let themeManager: ThemeManager | undefined;

let kernelEffectScope: EffectScope | undefined;

let stopEffectiveThemeWatcher: undefined | (() => void);

let stopBuiltinCommands: undefined | (() => void);

let stopTokenOverridesWatcher: undefined | (() => void);

let searchAdapter: SearchAdapter | undefined;

let initPromise: Promise<void> | undefined;

let initGeneration = 0;

let vfsInternal = createKernelVfs();
const idleScheduler = createKernelIdleScheduler();
const vfsAccess = createVfsAccessController({
  bus,
  permissions: permissionsInternal,
  processes: processesInternal,
});

const bootState: KernelBootFacade = reactive<KernelBootFacade>({
  status: "idle",
  progressFraction: 0,
  phaseLabel: "",
  error: null,
  scheduleIdleAfterShellReady: idleScheduler.schedule,
});

function requirePinia(): NonNullable<ReturnType<typeof getActivePinia>> {
  const pinia = getActivePinia();

  if (!pinia) {
    throw new Error("Kernel.init(): Pinia absent — mount createPinia() before BootManager.");
  }

  return pinia;
}

const trashInternal = new TrashManager({
  getVfs: () => vfsInternal,
  canUseVfs: vfsAccess.canUseVfs,
  emitVfsChanged(payload): void {
    bus.emit("vfs.changed", payload);
  },
  emitTrashChanged(payload): void {
    bus.emit("trash.changed", payload);
  },
});

export const kernel: Kernel = buildKernel();

type ProcessKillReason = "user" | "shell" | "kernel";

async function killAllProcessesAndWait(): Promise<void> {
  const handleIds = Array.from(processesInternal.list(), ([handleId]) => handleId);
  for (const handleId of handleIds) {
    kernel.processes.kill(handleId, "kernel");
  }

  if (pendingProcessKills.size > 0) {
    await Promise.allSettled(Array.from(pendingProcessKills.values()));
  }
}

function finishProcessKill(processId: string, reason: ProcessKillReason): void {
  const removed = processesInternal.kill(processId);
  pendingProcessKills.delete(processId);

  if (!removed) {
    return;
  }

  // Order matters:
  bus.emit("app.killed", {
    manifestId: removed.manifestId,
    handleId: processId,
    reason,
  });
  lifecycleInternal.emit("destroyed", processId);
  lifecycleInternal.unregister(processId);
}

function buildKernel(): Kernel {
  const registryFacades = createRegistryFacades({
    bus,
    widgets: widgetsCatalog,
    previews: previewsCatalog,
    desktopContextMenu: desktopContextMenuCatalog,
    desktopRenderers: desktopRendererCatalog,
    wallpapers: wallpapersCatalog,
  });

  return {
    async init(): Promise<void> {
      initPromise ??= (async (): Promise<void> => {
        const generation = initGeneration;
        const profile = ensureActiveProfileSessionForKernel();

        vfsInternal.dispose();
        vfsInternal = createKernelVfs(profile);

        // Boot may start from a component event handler. Keep kernel-owned
        // watchers out of that component's scope so unmounting the boot/auth
        // UI cannot silently stop live settings updates.
        kernelEffectScope?.stop();
        const effects = effectScope(true);
        kernelEffectScope = effects;

        const store = useSettingsStore(requirePinia());

        effects.run(() => {
          store.hydrate({
            storageNamespace: profileKvNamespace(profile.profileId, "settings"),

            onSettingsChanged: (key: keyof SettingsState): void => {
              bus.emit("settings.changed", { key });
            },

            onStorageSynced: (): void => {
              bus.emit("settings.synced", { source: "storage" });
            },
          });
        });

        themeManager ??= new ThemeManager({
          getPreference: (): SettingsState["theme"] => store.theme,

          persist: (preference): void => {
            store.setTheme(preference);
          },

          getSystemPreference,

          subscribeSystemPreference,
        });

        const resolved: ResolvedTheme = store.effectiveTheme;

        themeManager.applyToDocument(resolved);

        themeManager.subscribeSystemPreference();

        store.incrementBootCount();

        stopEffectiveThemeWatcher?.();

        stopEffectiveThemeWatcher = effects.run(() =>
          watch(
            (): ResolvedTheme => store.effectiveTheme,

            (t: ResolvedTheme): void => {
              if (!themeManager) {
                return;
              }

              themeManager.applyToDocument(t);

              themeManager.notifyResolved(t);

              bus.emit("theme.changed", { theme: t });
            },

            { flush: "post" },
          ),
        );

        // **Event ordering contract** — `tokens.changed` MUST fire AFTER
        // fires synchronously during `store.set`), the listener would race
        // Both paths (local + cross-tab) therefore emit only from the
        const overridesStore = useTokenOverridesStore(requirePinia());

        let lastTokenSnapshot: Record<string, string> = {};

        effects.run(() => {
          overridesStore.hydrate({
            storageNamespace: profileKvNamespace(profile.profileId, "tokens"),

            onStorageSynced: (): void => {
              // Cross-tab path. `applyKvPayload` has already mutated
              const next = overridesStore.snapshot();
              const mutated = themeManager?.applyOverrides(next) ?? false;
              if (mutated) {
                bus.emit("tokens.changed", {
                  keys: Object.keys(next),
                  source: "sync",
                });
                lastTokenSnapshot = { ...next };
              }
            },
          });
        });

        lastTokenSnapshot = overridesStore.snapshot();
        themeManager.applyOverrides(lastTokenSnapshot);

        stopTokenOverridesWatcher?.();
        stopTokenOverridesWatcher = effects.run(() =>
          watch(
            (): Record<string, string> => overridesStore.overrides,
            (next): void => {
              if (!themeManager) {
                return;
              }
              const changedKeys: string[] = [];
              const allKeys = new Set([...Object.keys(next), ...Object.keys(lastTokenSnapshot)]);
              for (const k of allKeys) {
                if (next[k] !== lastTokenSnapshot[k]) {
                  changedKeys.push(k);
                }
              }

              const mutated = themeManager.applyOverrides(next);

              lastTokenSnapshot = { ...next };

              if (mutated && changedKeys.length > 0) {
                bus.emit("tokens.changed", {
                  keys: changedKeys,
                  source: "local",
                });
              }
            },
            { flush: "post", deep: true },
          ),
        );

        const wallpaperStore = useWallpaperStore(requirePinia());
        wallpaperStore.hydrate({
          storageNamespace: profileKvNamespace(profile.profileId, "wallpapers"),
          dbName: profileIdbName(profile.profileId, "wallpapers"),
        });

        // for an app the user already remembered. Cross-tab sync
        const permissionStore = usePermissionStore(requirePinia());
        permissionStore.hydrate({
          storageNamespace: profileKvNamespace(profile.profileId, "permissions"),
        });

        // init → dispose → init cycle (HMR + tests) stays clean.
        stopBuiltinCommands?.();
        stopBuiltinCommands = registerBuiltinCommands(kernel);

        wallpapersCatalog.clear();
        seedBuiltinWallpapers(kernel.wallpapers, builtinWallpapers);

        searchAdapter?.dispose();
        const nextSearchAdapter = await createSearchAdapter(kernel, {
          vfsIndexer: new VfsSearchIndexer({ vfs: vfsInternal, events: bus }),
        });

        if (generation !== initGeneration) {
          nextSearchAdapter.dispose();

          return;
        }

        searchAdapter = nextSearchAdapter;
        searchAdapter.startVfsIndexing?.();

        debugLog("kernel ready");
      })();

      await initPromise;
    },

    dispose(): void {
      initGeneration += 1;
      searchAdapter?.dispose();
      searchAdapter = undefined;

      // HMR / test cycles see empty catalogs at the next `init`.
      wallpapersCatalog.clear();
      widgetsCatalog.clear();
      previewsCatalog.clear();
      desktopContextMenuCatalog.clear();
      desktopRendererCatalog.clear();
      appWidgetDisposers.clear();
      appPreviewDisposers.clear();
      appDesktopContributionDisposers.clear();

      stopBuiltinCommands?.();

      stopBuiltinCommands = undefined;

      stopTokenOverridesWatcher?.();

      stopTokenOverridesWatcher = undefined;

      stopEffectiveThemeWatcher?.();

      stopEffectiveThemeWatcher = undefined;

      kernelEffectScope?.stop();

      kernelEffectScope = undefined;

      themeManager?.dispose();

      themeManager = undefined;

      const pinia = getActivePinia();

      if (pinia) {
        useSettingsStore(pinia).dispose();
        useTokenOverridesStore(pinia).dispose();
        useWallpaperStore(pinia).dispose();
        usePermissionStore(pinia).dispose();
        useWidgetPlacementStore(pinia).dispose();
        useSpotlightRecentsStore(pinia).dispose();
      }

      // Resolve any in-flight permission prompts so a teardown mid-prompt
      // doesn't leave caller promises dangling.
      permissionsInternal.cancelPendingRequests();
      telemetryInternal.resetTransport();
      processesInternal.reset();
      pendingProcessKills.clear();

      idleScheduler.cancelPending();

      // "once per kernel lifetime" the rest of the kernel teardown
      resetAutorunLatch();
      resetInitialAppUrlIntentLatch();

      vfsInternal.dispose();
      vfsInternal = createKernelVfs();

      initPromise = undefined;
    },

    profile: {
      current() {
        return currentProfileSessionSnapshot();
      },

      async lock(): Promise<void> {
        lockActiveProfileSession();
      },

      unlock(session): void {
        unlockActiveProfileSession(session);
      },

      async signOut(): Promise<void> {
        await killAllProcessesAndWait();

        kernel.dispose();
        clearActiveProfileSession();
        globalThis.location?.reload();
      },

      async deleteCurrentAccount(): Promise<void> {
        const profile = currentProfileSessionSnapshot();

        await killAllProcessesAndWait();

        kernel.dispose();
        await deleteProfileAccount(profile.profileId);
        clearActiveProfileSession();
        globalThis.location?.reload();
      },

      isLocked(): boolean {
        return isProfileSessionLocked();
      },

      useLocked() {
        return useProfileSessionLocked();
      },
    },

    processes: {
      spawn(manifestId, args) {
        const handle = processesInternal.spawn(manifestId, args);

        lifecycleInternal.register(handle);

        lifecycleInternal.emit("created", handle.id);

        return handle;
      },

      kill(processId, reason = "shell") {
        if (pendingProcessKills.has(processId)) {
          return;
        }

        const pendingRemoval = processesInternal.get(processId);

        if (!pendingRemoval) {
          return;
        }

        pendingProcessKills.set(processId, Promise.resolve());
        const teardownWork: Array<Promise<unknown>> = [];
        bus.emit("app.will-kill", {
          manifestId: pendingRemoval.manifestId,
          handleId: processId,
          reason,
          waitUntil(promise) {
            teardownWork.push(Promise.resolve(promise));
          },
        });

        if (teardownWork.length > 0) {
          const completion = Promise.allSettled(teardownWork).then(() => {
            finishProcessKill(processId, reason);
          });
          pendingProcessKills.set(processId, completion);
          void completion;
          return;
        }

        finishProcessKill(processId, reason);
      },

      // actually changed (idempotent against duplicate suspend/resume
      suspend(handleId) {
        if (processesInternal.suspend(handleId)) {
          lifecycleInternal.emit("suspended", handleId);
        }
      },

      resume(handleId) {
        if (processesInternal.resume(handleId)) {
          lifecycleInternal.emit("resumed", handleId);
        }
      },

      list() {
        return processesInternal.list();
      },
    },

    lifecycleCoordinator: {
      register(handle) {
        lifecycleInternal.register(handle);
      },

      unregister(handleId) {
        lifecycleInternal.unregister(handleId);
      },

      emit(phase, handleId) {
        lifecycleInternal.emit(phase, handleId);
      },

      on(phase, handleId, callback) {
        return lifecycleInternal.on(phase, handleId, callback);
      },
    },

    boot: bootState,

    apps: {
      register(manifest, options) {
        registryCatalog.upsertManifest(manifest, options);
        registerAppPreviews({
          disposers: appPreviewDisposers,
          manifest,
          onDisposeError: (error) => {
            debugWarn("[kernel]", "app preview disposer failed", manifest.id, error);
          },
          onInvalidNamespace: (previewId) => {
            debugWarn(
              "[kernel]",
              "skipping app preview with invalid namespace",
              manifest.id,
              previewId,
            );
          },
          previews: kernel.previews,
        });
        registerAppWidgets({
          disposers: appWidgetDisposers,
          manifest,
          onDisposeError: (error) => {
            debugWarn("[kernel]", "app widget disposer failed", manifest.id, error);
          },
          onInvalidNamespace: (widgetId) => {
            debugWarn(
              "[kernel]",
              "skipping app widget with invalid namespace",
              manifest.id,
              widgetId,
            );
          },
          widgets: kernel.widgets,
        });
        registerAppDesktopContributions({
          contextMenu: kernel.desktop.contextMenu,
          disposers: appDesktopContributionDisposers,
          manifest,
          onDisposeError: (error) => {
            debugWarn("[kernel]", "app desktop contribution disposer failed", manifest.id, error);
          },
          onInvalidNamespace: (contributionId) => {
            debugWarn(
              "[kernel]",
              "skipping app desktop contribution with invalid namespace",
              manifest.id,
              contributionId,
            );
          },
          renderers: kernel.desktop.renderers,
        });
        bus.emit("app.registered", { id: manifest.id });
      },

      async launch(id, args) {
        const manifest = registryCatalog.manifests.get(id);

        if (!manifest) {
          throw new AppLaunchError(id);
        }

        let reusedExisting = false;

        let handle =
          manifest.singleton === true ? processesInternal.getSingletonFromManifest(id) : undefined;

        if (handle && pendingProcessKills.has(handle.id)) {
          await pendingProcessKills.get(handle.id);
          handle =
            manifest.singleton === true
              ? processesInternal.getSingletonFromManifest(id)
              : undefined;
        }

        if (handle && manifest.singleton === true) {
          reusedExisting = true;

          debugWarn("[kernel]", "singleton relaunch — returning existing process", manifest.id);

          if (args !== undefined) {
            debugWarn("[kernel]", "singleton relaunch — dropping new args", manifest.id, args);
          }

          bus.emit("app.launched", {
            manifestId: id,

            handleId: handle.id,

            reusedExisting,
          });

          return handle;
        }

        handle = processesInternal.spawn(id, args);

        if (manifest.singleton === true) {
          processesInternal.registerSingletonBridge(id, handle);
        }

        lifecycleInternal.register(handle);

        // Singleton reuse path returns above this point and intentionally
        lifecycleInternal.emit("created", handle.id);

        bus.emit("app.launched", {
          manifestId: id,

          handleId: handle.id,

          reusedExisting,
        });

        return handle;
      },

      unregister(manifestId: string): void {
        const hadEntry = registryCatalog.manifests.has(manifestId);
        disposeAppPreviews(appPreviewDisposers, manifestId, (error) => {
          debugWarn("[kernel]", "app preview disposer failed", manifestId, error);
        });
        disposeAppWidgets(appWidgetDisposers, manifestId, (error) => {
          debugWarn("[kernel]", "app widget disposer failed", manifestId, error);
        });
        disposeAppDesktopContributions(appDesktopContributionDisposers, manifestId, (error) => {
          debugWarn("[kernel]", "app desktop contribution disposer failed", manifestId, error);
        });
        registryCatalog.unregister(manifestId);
        if (hadEntry) {
          bus.emit("app.unregistered", { id: manifestId });
        }
      },

      list(filter) {
        let manifests = Array.from(registryCatalog.manifests.values());

        if (filter?.category) {
          manifests = manifests.filter((manifest) => manifest.category === filter.category);
        }

        return manifests;
      },
    },

    commands: {
      register(manifest) {
        const dispose = commandsCatalog.register(manifest);

        bus.emit("command.registered", { id: manifest.id });

        return (): void => {
          const hadEntry = commandsCatalog.has(manifest.id);

          dispose();

          if (hadEntry && !commandsCatalog.has(manifest.id)) {
            bus.emit("command.unregistered", { id: manifest.id });
          }
        };
      },

      unregister(id) {
        if (!commandsCatalog.has(id)) {
          return;
        }

        commandsCatalog.unregister(id);
        bus.emit("command.unregistered", { id });
      },

      async dispatch(id, options) {
        const startedAt = nowMs();
        const source = options?.source ?? "api";
        const knownAtDispatchStart = commandsCatalog.has(id);
        // CommandContext.signal must never be undefined so command bodies can
        const ctx: CommandContext = {
          kernel,
          source,
          activeHandle: options?.activeHandle ?? null,
          payload:
            options?.payload === undefined
              ? EMPTY_COMMAND_PAYLOAD
              : Object.freeze({ ...options.payload }),
          signal: options?.signal ?? noopAbortController.signal,
        };

        try {
          await commandsCatalog.dispatch(id, ctx);
          telemetryInternal.track({
            name: "command.dispatched",
            payload: {
              commandId: id,
              durationMs: durationSince(startedAt),
              source,
              status: "ok",
            },
          });
        } catch (error) {
          if (knownAtDispatchStart) {
            telemetryInternal.track({
              name: "command.dispatched",
              payload: {
                commandId: id,
                durationMs: durationSince(startedAt),
                source,
                status: "error",
              },
            });
          }
          throw error;
        }
      },

      list() {
        return commandsCatalog.list();
      },
    },

    events: bus,

    settings: createSettingsFacade({ bus, requirePinia }),

    vfs: createKernelVfsFacade({
      bus,
      canUseVfs: vfsAccess.canUseVfs,
      emitVfsChanged: vfsAccess.emitVfsChanged,
      getVfs: () => vfsInternal,
    }),

    telemetry: {
      isEnabled() {
        return telemetryInternal.isEnabled();
      },

      track(event) {
        return telemetryInternal.track(event);
      },

      setTransport(transport) {
        return telemetryInternal.setTransport(transport);
      },
    },

    theme: createThemeFacade({ requirePinia, getThemeManager: () => themeManager }),

    shortcuts: {
      register(binding: string, handler: (event: KeyboardEvent) => void): () => void {
        const chord = parseChord(binding);

        const listener = (event: KeyboardEvent): void => {
          if (chord === null) {
            return;
          }
          if (matchesChord(chord, event)) {
            handler(event);
          }
        };

        window.addEventListener("keydown", listener);

        return (): void => {
          window.removeEventListener("keydown", listener);
        };
      },
    },

    search: {
      query(text, options) {
        return Promise.resolve(searchAdapter?.query(text, options) ?? []);
      },
    },

    ...registryFacades,

    notifications: {
      /**
       * Permission-gated notification entry point. The gate is real and fully
       * wired (see notifications.permission.test.ts): system apps and
       * first-party apps that declare `notifications.post` auto-grant, a
       * persisted decision resolves without re-prompting, and everyone else
       * prompts via a parked `permission.requested`. On grant we mint and
       * return an opaque id; on denial we return `null` — a soft no-op that
       * callers MUST NOT retry.
       *
       * Delivery is intentionally NOT wired yet: there is no notification
       * surface to render `toast`, so on grant the payload is accepted (and
       * gated) but not displayed or buffered. A future notification host
       * should consume the granted call here; until then this is a permission
       * stub, not a renderer.
       */
      async enqueue(toast, options) {
        void toast;

        const decision = await permissionsInternal.request(
          options.manifestId,
          "notifications.post",
          { source: "app" },
        );
        if (!decision.granted) {
          return null;
        }

        return typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `note-${++notificationIdFallback}`;
      },
    },

    trash: {
      moveToTrash(path, options) {
        return trashInternal.moveToTrash(path, options);
      },
      list(options) {
        return trashInternal.list(options);
      },
      restore(id, options) {
        return trashInternal.restore(id, options);
      },
      remove(id, options) {
        return trashInternal.remove(id, options);
      },
      empty(options) {
        return trashInternal.empty(options);
      },
    },

    permissions: {
      request(manifestId, permission, options) {
        return permissionsInternal.request(manifestId, permission, options);
      },
      respond(requestId, response) {
        return permissionsInternal.respond(requestId, response);
      },
      revoke(manifestId, permission) {
        return permissionsInternal.revoke(manifestId, permission);
      },
      list(filter) {
        return permissionsInternal.list(filter);
      },
    },
  };
}
