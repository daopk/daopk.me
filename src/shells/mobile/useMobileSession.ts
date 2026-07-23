import { computed, nextTick, ref, watch, type ComputedRef, type DeepReadonly } from "vue";

import { hasAppSettings } from "~/core/apps/appSettings";
import { appSupportsShell } from "~/core/apps/shellSupport";
import {
  appBrowserTitle,
  appFallbackBrowserPath,
  DEFAULT_BROWSER_TITLE,
  HOME_BROWSER_PATH,
} from "~/core/routing/appBrowserPaths";
import { emitAppResume, resolveAppResume, type AppResumeSource } from "~/core/routing/appResume";
import {
  handleShellOpenRequest,
  type ShellOpenRequest,
  type ShellOpenRequestAdapter,
} from "~/shells/shared/shellOpenRequests";
import { useShellAppEventBridge } from "~/shells/shared/useShellAppEventBridge";
import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import { navigation, type NavigationFrame } from "./navigation";

export type { NavigationFrame } from "./navigation";

export interface MobileSessionState {
  readonly frames: DeepReadonly<NavigationFrame[]>;
  readonly foregroundFrameId: string | null;
  readonly homeVisible: boolean;
  readonly recentsAvailable: boolean;
  readonly recentsVisible: boolean;
  readonly launchingManifestIds: ReadonlySet<string>;
  readonly browserPath: string;
  readonly browserTitle: string;
}

export type MobileSessionIntent =
  | {
      readonly type: "launch-app";
      readonly manifestId: string;
      readonly args?: Readonly<Record<string, unknown>>;
      readonly source?: AppResumeSource;
    }
  | { readonly type: "go-home" }
  | { readonly type: "open-recents" }
  | { readonly type: "close-recents" }
  | { readonly type: "select-recent"; readonly frameId: string }
  | { readonly type: "dismiss"; readonly frameId: string }
  | { readonly type: "dismiss-all" }
  | {
      readonly type: "set-title";
      readonly handleId: string;
      readonly manifestId: string;
      readonly title: string | null;
    };

export interface MobileSession {
  readonly state: ComputedRef<MobileSessionState>;
  send(intent: MobileSessionIntent): void;
}

export interface MobileSessionAdapters {
  readonly kernel: Kernel;
  readonly titleFor: (manifestId: string) => string;
  readonly notifyUnsupported: (manifest: AppManifest) => void;
  readonly restoreHomeFocus: (manifestId: string) => void;
}

/**
 * Owns the policy for a mobile app session. The shell renders the returned
 * state and translates UI events into intents; launch ordering, resume,
 * recents, process navigation, open requests, and focus restoration stay here.
 */
export function useMobileSession(adapters: MobileSessionAdapters): MobileSession {
  const { kernel, notifyUnsupported, restoreHomeFocus, titleFor } = adapters;
  navigation.init(kernel);

  const recentsRequested = ref(false);
  const lastLaunchedManifestId = ref<string | null>(null);
  const launchingManifestIds = ref<ReadonlySet<string>>(new Set<string>());

  const currentFrame = computed<NavigationFrame | null>(() => {
    const foregroundFrameId = navigation.foreground.value;
    if (foregroundFrameId === null) {
      return null;
    }
    return navigation.stack.find((frame) => frame.frameId === foregroundFrameId) ?? null;
  });

  const state = computed<MobileSessionState>(() => {
    const frames = navigation.stack;
    const foregroundFrameId = navigation.foreground.value;
    const frame = currentFrame.value;
    const frameCount = frames.length;

    return {
      frames,
      foregroundFrameId,
      homeVisible: foregroundFrameId === null,
      recentsAvailable: foregroundFrameId === null && frameCount > 0,
      recentsVisible: recentsRequested.value && frameCount > 0,
      launchingManifestIds: launchingManifestIds.value,
      browserPath:
        frame === null
          ? HOME_BROWSER_PATH
          : (frame.browserPath ?? appFallbackBrowserPath(frame.manifestId)),
      browserTitle:
        frame === null
          ? DEFAULT_BROWSER_TITLE
          : appBrowserTitle(frame.title ?? titleFor(frame.manifestId)),
    };
  });

  function addLaunching(manifestId: string): void {
    const next = new Set(launchingManifestIds.value);
    next.add(manifestId);
    launchingManifestIds.value = next;
  }

  function clearLaunching(manifestId: string): void {
    if (!launchingManifestIds.value.has(manifestId)) {
      return;
    }
    const next = new Set(launchingManifestIds.value);
    next.delete(manifestId);
    launchingManifestIds.value = next;
  }

  function commitLaunched(manifestId: string): void {
    lastLaunchedManifestId.value = manifestId;
  }

  function manifestFor(manifestId: string): AppManifest | null {
    return kernel.apps.list().find((manifest) => manifest.id === manifestId) ?? null;
  }

  function manifestHasSettings(manifestId: string): boolean {
    const manifest = manifestFor(manifestId);
    return manifest !== null && hasAppSettings(manifest);
  }

  function unsupportedManifestFor(manifestId: string): AppManifest | null {
    const manifest = manifestFor(manifestId);
    if (!manifest || appSupportsShell(manifest, "mobile")) {
      return null;
    }
    return manifest;
  }

  function launch(
    manifestId: string,
    args?: Readonly<Record<string, unknown>>,
    source: AppResumeSource = "api",
  ): void {
    const unsupported = unsupportedManifestFor(manifestId);

    if (unsupported) {
      recentsRequested.value = false;
      clearLaunching(manifestId);
      notifyUnsupported(unsupported);
      return;
    }

    const willResume = navigation.stack.some((frame) => frame.manifestId === manifestId);
    if (!willResume) {
      addLaunching(manifestId);
    }

    void navigation.launch(manifestId, args).then(
      () => {
        if (!willResume) {
          clearLaunching(manifestId);
        }
        if (willResume) {
          const emission = resolveAppResume({
            manifestId,
            ...(args === undefined ? {} : { args }),
            source,
            resolveHandleId: (id) =>
              navigation.stack.find((entry) => entry.manifestId === id)?.handleId,
            manifestHasSettings,
          });
          if (emission !== null) {
            emitAppResume(kernel.events, emission);
          }
        }
        commitLaunched(manifestId);
      },
      () => {
        clearLaunching(manifestId);
      },
    );
  }

  function spawnNew(manifestId: string, args?: Readonly<Record<string, unknown>>): Promise<void> {
    const unsupported = unsupportedManifestFor(manifestId);

    if (unsupported) {
      recentsRequested.value = false;
      clearLaunching(manifestId);
      notifyUnsupported(unsupported);
      return Promise.resolve();
    }

    addLaunching(manifestId);
    return navigation.spawnNew(manifestId, args).then(
      () => {
        clearLaunching(manifestId);
        commitLaunched(manifestId);
      },
      () => {
        clearLaunching(manifestId);
      },
    );
  }

  const mobileOpenRequestAdapter: ShellOpenRequestAdapter<DeepReadonly<NavigationFrame>> = {
    findPreferred(manifestId, predicate) {
      const candidates = navigation.stack.filter(
        (frame) => frame.manifestId === manifestId && predicate(frame),
      );
      if (candidates.length === 0) {
        return null;
      }

      return (
        candidates.find((frame) => frame.frameId === navigation.foreground.value) ??
        candidates.at(-1)!
      );
    },
    async apply(action) {
      switch (action.type) {
        case "focus":
          navigation.focusFrame(action.target.frameId);
          return;
        case "reuse-editor":
          navigation.focusFrame(action.target.frameId);
          await nextTick();
          kernel.events.emit("editor.window.open.requested", {
            handleId: action.target.handleId,
            path: action.path,
          });
          commitLaunched("editor");
          return;
        case "spawn":
          await spawnNew(action.manifestId, action.args);
          return;
      }
    },
  };

  async function open(request: ShellOpenRequest): Promise<void> {
    const unsupported = unsupportedManifestFor(request.manifestId);
    if (unsupported) {
      recentsRequested.value = false;
      clearLaunching(request.manifestId);
      notifyUnsupported(unsupported);
      return;
    }

    await handleShellOpenRequest(request, mobileOpenRequestAdapter);
  }

  function closeRecentsWhenEmpty(): void {
    if (navigation.stack.length === 0) {
      recentsRequested.value = false;
    }
  }

  function send(intent: MobileSessionIntent): void {
    switch (intent.type) {
      case "launch-app":
        launch(intent.manifestId, intent.args, intent.source);
        return;
      case "go-home":
        navigation.goHome();
        return;
      case "open-recents":
        if (navigation.stack.length > 0) {
          recentsRequested.value = true;
        }
        return;
      case "close-recents":
        recentsRequested.value = false;
        return;
      case "select-recent":
        navigation.focusFrame(intent.frameId);
        recentsRequested.value = false;
        return;
      case "dismiss":
        navigation.dismiss(intent.frameId);
        closeRecentsWhenEmpty();
        return;
      case "dismiss-all":
        navigation.dismissAll();
        recentsRequested.value = false;
        return;
      case "set-title":
        navigation.setTitle(intent.handleId, intent.manifestId, intent.title);
        return;
    }
  }

  useShellAppEventBridge(
    {
      launch,
      spawnNew: (manifestId, args) => {
        void spawnNew(manifestId, args);
      },
      open: (request) => {
        void open(request);
      },
      setDocumentPath: (handleId, manifestId, path) => {
        navigation.setDocumentPath(handleId, manifestId, path);
      },
      setBrowserPath: (handleId, manifestId, path) => {
        navigation.setBrowserPath(handleId, manifestId, path);
      },
      removeByHandleId: (handleId) => {
        navigation.removeByHandleId(handleId);
        closeRecentsWhenEmpty();
      },
    },
    kernel,
  );

  watch(
    () => navigation.foreground.value,
    async (next, previous) => {
      if (previous === null || next !== null || lastLaunchedManifestId.value === null) {
        return;
      }
      await nextTick();
      restoreHomeFocus(lastLaunchedManifestId.value);
    },
  );

  return { state, send };
}
