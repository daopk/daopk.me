import { debugWarn } from "~/core/debug";
import type { CommandContext, CommandManifest } from "~/types/command";
import type { Kernel } from "~/types/kernel";
import { isSettingsSectionId, type SettingsSectionId } from "~/types/settings";

function payloadString(ctx: CommandContext, key: string, commandId: string): string | null {
  const value = ctx.payload[key];
  if (typeof value !== "string" || value.length === 0) {
    debugWarn("[commands]", commandId, "missing string payload", key);
    return null;
  }

  return value;
}

function payloadManifestId(ctx: CommandContext, kernel: Kernel, commandId: string): string | null {
  const manifestId = payloadString(ctx, "manifestId", commandId);
  if (manifestId === null) {
    return null;
  }

  if (!kernel.apps.list().some((manifest) => manifest.id === manifestId)) {
    debugWarn("[commands]", commandId, "unknown manifest", manifestId);
    return null;
  }

  return manifestId;
}

function payloadSettingsSection(ctx: CommandContext, commandId: string): SettingsSectionId | null {
  const value = payloadString(ctx, "section", commandId);
  if (value === null) {
    return null;
  }

  if (!isSettingsSectionId(value)) {
    debugWarn("[commands]", commandId, "invalid settings section", value);
    return null;
  }

  return value;
}

export function buildBuiltinCommands(kernel: Kernel): readonly CommandManifest[] {
  return [
    {
      id: "app:open",
      title: "Open App",
      scope: "shell",
      run(ctx) {
        const manifestId = payloadManifestId(ctx, kernel, "app:open");
        if (manifestId === null) return;
        kernel.events.emit("app.launch.requested", { manifestId, source: ctx.source });
      },
    },
    {
      id: "app:spawnNew",
      title: "Open New App Window",
      scope: "shell",
      run(ctx) {
        const manifestId = payloadManifestId(ctx, kernel, "app:spawnNew");
        if (manifestId === null) return;
        kernel.events.emit("app.spawn.new", { manifestId, source: ctx.source });
      },
    },
    {
      id: "spotlight:open",
      title: "Open Spotlight",
      scope: "shell",
      run(ctx) {
        kernel.events.emit("spotlight.open.requested", { source: ctx.source });
      },
    },
    {
      id: "settings:openSection",
      title: "Open Settings Section",
      scope: "shell",
      run(ctx) {
        const section = payloadSettingsSection(ctx, "settings:openSection");
        if (section === null) return;
        kernel.events.emit("app.launch.requested", {
          manifestId: "settings",
          source: ctx.source,
          args: { section },
        });
      },
    },
    {
      id: "widgets:openGallery",
      title: "Add Widgets",
      scope: "shell",
      keywords: ["widgets", "desktop", "gallery", "customize"],
      run(ctx) {
        kernel.events.emit("widget.gallery.open.requested", { source: ctx.source });
      },
    },
    {
      id: "system:lock",
      title: "Lock Desktop",
      scope: "global",
      keywords: ["lock", "security", "account", "session"],
      async run() {
        await kernel.profile.lock();
      },
    },
    {
      id: "system:signOut",
      title: "Sign Out",
      scope: "global",
      keywords: ["logout", "log out", "signout", "account", "session"],
      async run() {
        await kernel.profile.signOut();
      },
    },
    {
      id: "finder:open",
      title: "Open Finder",
      scope: "global",
      keywords: ["files", "finder", "browser", "vfs", "folder"],
      run(ctx) {
        kernel.events.emit("app.launch.requested", { manifestId: "finder", source: ctx.source });
      },
    },
    {
      id: "browser:open",
      title: "Open Browser",
      scope: "global",
      keywords: ["web", "internet", "browser", "url", "site"],
      run(ctx) {
        kernel.events.emit("app.launch.requested", { manifestId: "browser", source: ctx.source });
      },
    },
    {
      id: "editor:open",
      title: "Open Editor",
      scope: "global",
      keywords: ["editor", "text", "markdown", "write", "notes", "vfs"],
      run(ctx) {
        kernel.events.emit("app.launch.requested", { manifestId: "editor", source: ctx.source });
      },
    },
    {
      id: "notes:open",
      title: "Open Notes",
      scope: "global",
      keywords: ["notes", "markdown", "writing", "drafts", "journal"],
      run(ctx) {
        kernel.events.emit("app.launch.requested", { manifestId: "notes", source: ctx.source });
      },
    },
    {
      id: "slides:open",
      title: "Open Slides",
      scope: "global",
      keywords: ["slides", "slidev", "deck", "presentation", "markdown", "vfs"],
      run(ctx) {
        kernel.events.emit("app.launch.requested", { manifestId: "slides", source: ctx.source });
      },
    },
    {
      id: "pdf-viewer:open",
      title: "Open PDF Viewer",
      scope: "global",
      keywords: ["pdf", "document", "reader", "viewer"],
      run(ctx) {
        kernel.events.emit("app.launch.requested", {
          manifestId: "pdf-viewer",
          source: ctx.source,
        });
      },
    },
    {
      id: "theme:toggle",
      title: "Toggle Theme",
      hint: "Switch between Light and Dark",
      shortcut: "Meta+Shift+T",
      scope: "global",
      keywords: ["dark", "light", "appearance", "switch"],
      run() {
        const next = kernel.theme.current() === "dark" ? "light" : "dark";
        kernel.theme.setTheme(next);
      },
    },
    {
      id: "theme:setLight",
      title: "Light Theme",
      scope: "global",
      keywords: ["bright", "day", "appearance"],
      run() {
        kernel.theme.setTheme("light");
      },
    },
    {
      id: "theme:setDark",
      title: "Dark Theme",
      scope: "global",
      keywords: ["night", "dim", "appearance"],
      run() {
        kernel.theme.setTheme("dark");
      },
    },
  ];
}

/**
 * Registers every built-in command and returns a disposer that unregisters
 * the same set. Safe to call again after the disposer runs (idempotent across
 * init/dispose cycles) because the disposer drops the slot before re-register.
 */
export function registerBuiltinCommands(kernel: Kernel): () => void {
  const disposers = buildBuiltinCommands(kernel).map((manifest) =>
    kernel.commands.register(manifest),
  );

  return (): void => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}
