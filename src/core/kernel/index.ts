import { getActivePinia } from "pinia";
import { reactive, toRef, watch } from "vue";

import type { CommandContext } from "~/types/command";
import type { ResolvedTheme } from "~/types/theme";
import type { Kernel, KernelBootFacade } from "~/types/kernel";
import type { SettingsState } from "~/types/settings";

import { resetAutorunLatch } from "~/core/boot/autorun";
import { debugLog, debugWarn } from "~/core/debug";
import { AppLaunchError } from "~/core/kernel/errors";
import { AppRegistry } from "~/core/kernel/AppRegistry";
import { seedBuiltinBlogPosts } from "~/core/kernel/builtinBlogPosts";
import { CommandRegistry } from "~/core/kernel/CommandRegistry";
import { registerBuiltinCommands } from "~/core/kernel/builtinCommands";
import { EventBus } from "~/core/kernel/EventBus";
import { Lifecycle } from "~/core/kernel/Lifecycle";
import { PermissionLedger } from "~/core/kernel/PermissionLedger";
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
  disposeAppWidgets,
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
const appWidgetDisposers = new Map<string, Array<() => void>>();
const lifecycleInternal = new Lifecycle();
const processesInternal = new ProcessTable();
const pendingProcessKills = new Map<string, Promise<void>>();
const queuedNotifications = new Map<string, Record<string, unknown>>();
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
  listApps: () => [...registryCatalog.manifests.values()],
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

export { AppLaunchError, CommandDuplicateError, CommandNotFoundError } from "~/core/kernel/errors";

export type { AppLaunchErrorCode } from "~/core/kernel/errors";

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
  return {
    async init(): Promise<void> {
      initPromise ??= (async (): Promise<void> => {
        const generation = initGeneration;
        const profile = ensureActiveProfileSessionForKernel();

        vfsInternal.dispose();
        vfsInternal = createKernelVfs(profile);

        const store = useSettingsStore(requirePinia());

        store.hydrate({
          storageNamespace: profileKvNamespace(profile.profileId, "settings"),

          onSettingsChanged: (key: keyof SettingsState): void => {
            bus.emit("settings.changed", { key });
          },

          onStorageSynced: (): void => {
            bus.emit("settings.synced", { source: "storage" });
          },
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

        stopEffectiveThemeWatcher = watch(
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
        );

        // **Event ordering contract** — `tokens.changed` MUST fire AFTER
        // fires synchronously during `store.set`), the listener would race
        // Both paths (local + cross-tab) therefore emit only from the
        const overridesStore = useTokenOverridesStore(requirePinia());

        let lastTokenSnapshot: Record<string, string> = {};

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

        lastTokenSnapshot = overridesStore.snapshot();
        themeManager.applyOverrides(lastTokenSnapshot);

        stopTokenOverridesWatcher?.();
        stopTokenOverridesWatcher = watch(
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

        wallpapersCatalog.__resetForTests();
        seedBuiltinWallpapers(kernel.wallpapers, builtinWallpapers);

        searchAdapter?.dispose();
        const nextSearchAdapter = await createSearchAdapter(kernel, {
          vfsIndexer: new VfsSearchIndexer({ vfs: vfsInternal, events: bus }),
        });

        if (generation !== initGeneration) {
          nextSearchAdapter.dispose();

          return;
        }

        try {
          await seedBuiltinBlogPosts(vfsInternal);
        } catch (error: unknown) {
          debugWarn("[blog]", "failed to seed built-in blog posts", error);
        }

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

      // HMR / test cycles see empty catalogs at the next `init`
      // teardown story.
      wallpapersCatalog.__resetForTests();
      widgetsCatalog.__resetForTests();
      appWidgetDisposers.clear();

      stopBuiltinCommands?.();

      stopBuiltinCommands = undefined;

      stopTokenOverridesWatcher?.();

      stopTokenOverridesWatcher = undefined;

      stopEffectiveThemeWatcher?.();

      stopEffectiveThemeWatcher = undefined;

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

      // a kernel teardown mid-prompt doesn't leave caller promises
      // Tests opt into this via `__resetForTests` directly; HMR /
      permissionsInternal.__resetForTests();
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
      register(manifest) {
        registryCatalog.upsertManifest(manifest);
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
        disposeAppWidgets(appWidgetDisposers, manifestId, (error) => {
          debugWarn("[kernel]", "app widget disposer failed", manifestId, error);
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

    settings: {
      use<K extends keyof SettingsState>(key: K) {
        return toRef(useSettingsStore(requirePinia()), key);
      },

      get<K extends keyof SettingsState>(key: K): SettingsState[K] {
        return useSettingsStore(requirePinia())[key];
      },

      set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void {
        const settings = useSettingsStore(requirePinia());

        switch (key) {
          case "theme":
            settings.setTheme(value as SettingsState["theme"]);

            return;

          case "shellOverride":
            settings.setShellOverride(value as SettingsState["shellOverride"]);

            return;

          case "reduceMotion":
            settings.$patch({ reduceMotion: value as SettingsState["reduceMotion"] });

            bus.emit("settings.changed", { key: "reduceMotion" });

            return;

          case "dockAutoHide":
            settings.setDockAutoHide(value as SettingsState["dockAutoHide"]);

            return;

          case "dockPinnedAppIds":
            settings.setDockPinnedAppIds(value as SettingsState["dockPinnedAppIds"]);

            return;

          case "telemetryEnabled":
            settings.$patch({ telemetryEnabled: value as SettingsState["telemetryEnabled"] });

            bus.emit("settings.changed", { key: "telemetryEnabled" });

            return;

          case "desktopWallpaperActiveId":
            settings.setDesktopWallpaperActiveId(
              value as SettingsState["desktopWallpaperActiveId"],
            );

            return;

          case "mobileWallpaperActiveId":
            settings.setMobileWallpaperActiveId(value as SettingsState["mobileWallpaperActiveId"]);

            return;

          case "bootCount":
            throw new Error(
              `kernel.settings.set('bootCount') — mutate via bootstrap / store.incrementBootCount() only.`,
            );
        }
      },

      reset(): void {
        useSettingsStore(requirePinia()).reset();
      },
    },

    vfs: createKernelVfsFacade({
      bus,
      canUseVfs: vfsAccess.canUseVfs,
      emitVfsChanged: vfsAccess.emitVfsChanged,
      getVfs: () => vfsInternal,
    }),

    background: {
      async run<Result = unknown>(jobId: string, input: Record<string, unknown>): Promise<Result> {
        void input;

        debugLog("[kernel stub] background.run", jobId);

        return undefined as Result;
      },
    },

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

    theme: {
      current(): ResolvedTheme {
        if (!themeManager) {
          throw new Error("kernel.theme.current() called before kernel.init()");
        }

        return themeManager.current();
      },

      setTheme(name: SettingsState["theme"]): void {
        if (!themeManager) {
          throw new Error("kernel.theme.setTheme() called before kernel.init()");
        }

        themeManager.setTheme(name);
      },

      subscribe(listener: (theme: ResolvedTheme) => void): () => void {
        if (!themeManager) {
          throw new Error("kernel.theme.subscribe() called before kernel.init()");
        }

        return themeManager.subscribe(listener);
      },

      list() {
        if (!themeManager) {
          throw new Error("kernel.theme.list() called before kernel.init()");
        }

        return themeManager.list();
      },

      currentOverrides() {
        if (!themeManager) {
          throw new Error("kernel.theme.currentOverrides() called before kernel.init()");
        }

        return themeManager.currentOverrides();
      },

      setOverride(cssVar: string, value: string): void {
        useTokenOverridesStore(requirePinia()).set(cssVar, value);
      },

      unsetOverride(cssVar: string): void {
        useTokenOverridesStore(requirePinia()).unset(cssVar);
      },

      setOverrides(patch): void {
        useTokenOverridesStore(requirePinia()).setMany({ ...patch });
      },

      resetOverrides(): void {
        useTokenOverridesStore(requirePinia()).reset();
      },
    },

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

    widgets: {
      register(manifest) {
        const dispose = widgetsCatalog.register(manifest);

        bus.emit("widget.registered", { id: manifest.id });

        return (): void => {
          // disposer must be a no-op — otherwise it would silently
          const current = widgetsCatalog.get(manifest.id);
          if (current === manifest) {
            dispose();
            bus.emit("widget.unregistered", { id: manifest.id });
          }
        };
      },

      unregister(id) {
        const removed = widgetsCatalog.unregister(id);
        if (removed) {
          bus.emit("widget.unregistered", { id });
        }
      },

      list(filter) {
        return widgetsCatalog.list(filter);
      },

      get(id) {
        return widgetsCatalog.get(id);
      },
    },

    wallpapers: {
      register(manifest) {
        const dispose = wallpapersCatalog.register(manifest);

        bus.emit("wallpaper.registered", { id: manifest.id });

        return (): void => {
          // the replacement, so the stale disposer must be a no-op —
          // bug under HMR re-register flows). The registry's
          const current = wallpapersCatalog.get(manifest.id);
          if (current === manifest) {
            dispose();
            bus.emit("wallpaper.unregistered", { id: manifest.id });
          }
        };
      },

      unregister(id) {
        const removed = wallpapersCatalog.unregister(id);
        if (removed) {
          bus.emit("wallpaper.unregistered", { id });
        }
      },

      list() {
        return wallpapersCatalog.list();
      },

      get(id) {
        return wallpapersCatalog.get(id);
      },
    },

    notifications: {
      // kernel-side permission gate. The contract is that
      // persisted grant MUST still emit a `permission.requested`
      async enqueue(payload, options) {
        const decision = await permissionsInternal.request(
          options.manifestId,
          "notifications.post",
          { source: "app" },
        );
        if (!decision.granted) {
          // Denial is a soft no-op — callers MUST NOT retry. The
          return null;
        }

        const id =
          typeof globalThis.crypto?.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : `note-${queuedNotifications.size + 1}`;

        queuedNotifications.set(id, payload);

        return id;
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
