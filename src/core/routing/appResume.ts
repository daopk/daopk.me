import { isAppSettingsLaunchArgs } from "~/core/apps/appSettings";
import type { KernelEventsFacade } from "~/types/kernel";
import { isSettingsSectionId } from "~/types/settings";

/**
 * Launch source carried by `app.launch.requested`. A resumed launch replays
 * the same intent the source would have produced on a fresh launch.
 */
export type AppResumeSource = KernelEventPayloads["app.launch.requested"]["source"];

/**
 * Shell-agnostic context for deciding what to replay when an already-running
 * app is resumed (desktop window restore/focus, mobile frame resume). The two
 * shells differ only in how they resolve a handle id and whether a manifest
 * exposes app settings, so those are injected as callbacks.
 */
export interface AppResumeContext {
  manifestId: string;
  args?: Readonly<Record<string, unknown>>;
  source: AppResumeSource;
  /** Resolve the focused/foreground handle id for the manifest, if any. */
  resolveHandleId: (manifestId: string) => string | undefined;
  /** Whether the manifest exposes an app-settings pane. */
  manifestHasSettings: (manifestId: string) => boolean;
}

/**
 * A typed kernel event to emit on resume. Keeping the channel and payload
 * paired as a discriminated union lets {@link emitAppResume} stay type-safe.
 */
export type AppResumeEmission =
  | {
      event: "finder.reveal.requested";
      payload: KernelEventPayloads["finder.reveal.requested"];
    }
  | {
      event: "settings.section.requested";
      payload: KernelEventPayloads["settings.section.requested"];
    }
  | {
      event: "app.settings.requested";
      payload: KernelEventPayloads["app.settings.requested"];
    }
  | {
      event: "blog.open.requested";
      payload: KernelEventPayloads["blog.open.requested"];
    };

type AppResumeHandler = (ctx: AppResumeContext) => AppResumeEmission | null;

const resumeFinderReveal: AppResumeHandler = ({ manifestId, args }) => {
  if (manifestId !== "finder" || typeof args?.path !== "string") {
    return null;
  }

  const reveal = typeof args.reveal === "string" ? args.reveal : undefined;
  return {
    event: "finder.reveal.requested",
    payload: {
      path: args.path,
      ...(reveal === undefined ? {} : { reveal }),
      source: "spotlight",
    },
  };
};

const resumeSettingsSection: AppResumeHandler = ({ manifestId, args }) => {
  if (manifestId !== "settings" || typeof args?.section !== "string") {
    return null;
  }

  if (!isSettingsSectionId(args.section)) {
    return null;
  }

  return {
    event: "settings.section.requested",
    payload: { section: args.section },
  };
};

const resumeAppSettings: AppResumeHandler = ({
  manifestId,
  args,
  resolveHandleId,
  manifestHasSettings,
}) => {
  if (!isAppSettingsLaunchArgs(args) || !manifestHasSettings(manifestId)) {
    return null;
  }

  const handleId = resolveHandleId(manifestId);
  return {
    event: "app.settings.requested",
    payload: {
      manifestId,
      ...(handleId === undefined ? {} : { handleId }),
    },
  };
};

const resumeBlogOpen: AppResumeHandler = ({ manifestId, args, source }) => {
  if (manifestId !== "blog") {
    return null;
  }

  if (args === undefined && source !== "deeplink") {
    return null;
  }

  return {
    event: "blog.open.requested",
    payload: {
      source,
      ...(typeof args?.slug === "string" ? { slug: args.slug } : {}),
      ...(typeof args?.path === "string" ? { path: args.path } : {}),
    },
  };
};

/**
 * Ordered registry of resume handlers. Order matters: the first handler that
 * matches wins, mirroring the original desktop `||` precedence
 * (finder → settings section → app settings → blog).
 */
const APP_RESUME_HANDLERS: readonly AppResumeHandler[] = [
  resumeFinderReveal,
  resumeSettingsSection,
  resumeAppSettings,
  resumeBlogOpen,
];

/**
 * Walk the resume registry and return the first matching emission, or `null`
 * when no handler recognises the resume args. Callers decide when to emit
 * (e.g. after `nextTick`) via {@link emitAppResume}.
 */
export function resolveAppResume(ctx: AppResumeContext): AppResumeEmission | null {
  for (const handler of APP_RESUME_HANDLERS) {
    const emission = handler(ctx);
    if (emission !== null) {
      return emission;
    }
  }

  return null;
}

/** Emit a resolved resume emission on the kernel event bus, type-safely. */
export function emitAppResume(events: KernelEventsFacade, emission: AppResumeEmission): void {
  switch (emission.event) {
    case "finder.reveal.requested":
      events.emit(emission.event, emission.payload);
      return;
    case "settings.section.requested":
      events.emit(emission.event, emission.payload);
      return;
    case "app.settings.requested":
      events.emit(emission.event, emission.payload);
      return;
    case "blog.open.requested":
      events.emit(emission.event, emission.payload);
      return;
  }
}
