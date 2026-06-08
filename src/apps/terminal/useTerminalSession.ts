import { onScopeDispose, ref, type Ref } from "vue";

import { useCommands } from "~/composables/useCommands";
import { useKernel } from "~/composables/useKernel";

import type { CommandManifest } from "~/types/command";
import { joinVfsPath, normalizeVfsPath } from "~/core/vfs/path";
import type { VfsDirEntry } from "~/core/vfs/nodes";

export type ScrollbackKind = "input" | "output" | "error" | "system";

export interface ScrollbackEntry {
  kind: ScrollbackKind;
  text: string;
  ts: number;
}

const SCROLLBACK_CAP = 500;
const HISTORY_CAP = 100;

export function getInstanceAliases(instanceId: string): Readonly<Record<string, string>> {
  return Object.freeze({
    help: `terminal:${instanceId}:help`,
    clear: `terminal:${instanceId}:clear`,
    cd: `terminal:${instanceId}:cd`,
    ls: `terminal:${instanceId}:ls`,
    new: `terminal:${instanceId}:new`,
  });
}

const BLOCKED_TERMINAL_COMMAND_PREFIXES = ["app:", "settings:", "theme:", "widgets:"] as const;
const BLOCKED_TERMINAL_COMMAND_IDS = new Set([
  "browser:open",
  "editor:open",
  "finder:open",
  "notes:open",
  "pdf-viewer:open",
]);

function isBlockedTerminalCommand(id: string): boolean {
  return (
    BLOCKED_TERMINAL_COMMAND_IDS.has(id) ||
    BLOCKED_TERMINAL_COMMAND_PREFIXES.some((prefix) => id.startsWith(prefix))
  );
}

export interface TerminalSessionBindings {
  scrollback: Ref<readonly ScrollbackEntry[]>;
  history: Ref<readonly string[]>;
  cwd: Ref<string>;
  submit(line: string): Promise<void>;
  prevHistory(): string | undefined;
  nextHistory(): string | undefined;
  resetHistoryCursor(): void;
}

export function resolveCommandId(
  rawInput: string,
  aliases: Readonly<Record<string, string>>,
): string {
  const head = splitCommandLine(rawInput)[0] ?? "";
  return aliases[head] ?? head;
}

function splitCommandLine(rawInput: string): readonly string[] {
  return rawInput.trim().split(/\s+/).filter(Boolean);
}

function resolveVfsArgumentPath(rawPath: string, cwd: string): string {
  if (rawPath === "." || rawPath === "") {
    return cwd;
  }
  if (rawPath === "~") {
    return "/home";
  }
  if (rawPath.startsWith("~/")) {
    return normalizeVfsPath(`/home/${rawPath.slice(2)}`);
  }
  if (rawPath.startsWith("/")) {
    return normalizeVfsPath(rawPath);
  }

  return joinVfsPath(cwd, rawPath);
}

function resolveLsPath(args: readonly string[], cwd: string): { path: string } | { error: string } {
  if (args.some((arg) => arg.startsWith("-"))) {
    return { error: "options are not supported yet" };
  }
  if (args.length > 1) {
    return { error: "expected at most one path" };
  }

  try {
    return { path: resolveVfsArgumentPath(args[0] ?? ".", cwd) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

function resolveCdPath(args: readonly string[], cwd: string): { path: string } | { error: string } {
  if (args.some((arg) => arg.startsWith("-"))) {
    return { error: "options are not supported yet" };
  }
  if (args.length > 1) {
    return { error: "expected at most one path" };
  }

  try {
    return { path: resolveVfsArgumentPath(args[0] ?? "~", cwd) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

function formatLsEntry(entry: VfsDirEntry): string {
  return entry.kind === "directory" ? `${entry.name}/` : entry.name;
}

export function useTerminalSession(instanceId: string): TerminalSessionBindings {
  const kernel = useKernel();
  const { commands, register, dispatch } = useCommands();

  const aliases = getInstanceAliases(instanceId);
  const terminalPrefix = `terminal:${instanceId}:`;
  const pendingCommandArgs = new Map<string, readonly string[]>();
  const cwd = ref<string>("/");

  const scrollback = ref<ScrollbackEntry[]>([
    {
      kind: "system",
      text: "Terminal — type `help` for available Terminal commands.",
      ts: Date.now(),
    },
  ]);
  const history = ref<string[]>([]);
  const historyCursor = ref<number>(-1);

  function pushScrollback(entry: ScrollbackEntry): void {
    const next = scrollback.value.concat(entry);
    scrollback.value = next.length > SCROLLBACK_CAP ? next.slice(-SCROLLBACK_CAP) : next;
  }

  function write(text: string, kind: ScrollbackKind = "output"): void {
    pushScrollback({ kind, text, ts: Date.now() });
  }

  function clearScrollback(): void {
    scrollback.value = [];
  }

  // so re-mounting the Terminal (HMR, window close+reopen) does not leak
  const localCommands: CommandManifest[] = [
    {
      id: `terminal:${instanceId}:help`,
      title: "List available commands",
      hint: "Show Terminal command ids and aliases",
      scope: "global",
      run() {
        const sorted = commands.value
          .filter((c) => c.id.startsWith(terminalPrefix))
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id));
        write(`Available commands (${sorted.length}):`);
        for (const c of sorted) {
          const displayId = c.id.startsWith(terminalPrefix)
            ? `terminal:${c.id.slice(terminalPrefix.length)}`
            : c.id;
          write(`  ${displayId.padEnd(24)} ${c.title}`);
        }
        write("");
        write("Aliases:");
        for (const [alias, target] of Object.entries(aliases)) {
          const displayTarget = target.startsWith(terminalPrefix)
            ? `terminal:${target.slice(terminalPrefix.length)}`
            : target;
          write(`  ${alias.padEnd(10)} → ${displayTarget}`);
        }
      },
    },
    {
      id: `terminal:${instanceId}:clear`,
      title: "Clear the terminal",
      scope: "global",
      run() {
        clearScrollback();
      },
    },
    {
      id: `terminal:${instanceId}:cd`,
      title: "Change VFS directory",
      scope: "global",
      async run() {
        const args = pendingCommandArgs.get(`terminal:${instanceId}:cd`) ?? [];
        const target = resolveCdPath(args, cwd.value);
        if ("error" in target) {
          write(`cd: ${target.error}`, "error");

          return;
        }

        try {
          const stat = await kernel.vfs.stat(target.path, { handleId: instanceId });
          if (stat === null) {
            write("cd: permission denied", "error");

            return;
          }
          if (stat.kind !== "directory") {
            write(`cd: not a directory: ${target.path}`, "error");

            return;
          }

          cwd.value = stat.path;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          write(`cd: ${message}`, "error");
        }
      },
    },
    {
      id: `terminal:${instanceId}:ls`,
      title: "List VFS entries",
      scope: "global",
      async run() {
        const args = pendingCommandArgs.get(`terminal:${instanceId}:ls`) ?? [];
        const target = resolveLsPath(args, cwd.value);
        if ("error" in target) {
          write(`ls: ${target.error}`, "error");

          return;
        }

        try {
          const entries = await kernel.vfs.list(target.path, { handleId: instanceId });
          if (entries === null) {
            write("ls: permission denied", "error");

            return;
          }

          write(entries.length === 0 ? "ls: (empty)" : entries.map(formatLsEntry).join("  "));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          write(`ls: ${message}`, "error");
        }
      },
    },
    {
      id: `terminal:${instanceId}:new`,
      title: "Open a new Terminal window",
      scope: "global",
      run() {
        kernel.events.emit("app.spawn.new", {
          manifestId: "terminal",
          source: "terminal",
          args: { parentInstanceId: instanceId },
        });
      },
    },
  ];

  const stops: Array<() => void> = [];
  for (const manifest of localCommands) {
    stops.push(register(manifest));
  }

  onScopeDispose(() => {
    for (const stop of stops) {
      stop();
    }
  });

  async function submit(line: string): Promise<void> {
    const trimmed = line.trim();
    if (trimmed === "") {
      return;
    }

    const nextHistory = history.value.concat(trimmed);
    history.value =
      nextHistory.length > HISTORY_CAP ? nextHistory.slice(-HISTORY_CAP) : nextHistory;
    historyCursor.value = -1;

    pushScrollback({ kind: "input", text: trimmed, ts: Date.now() });

    const tokens = splitCommandLine(trimmed);
    const id = resolveCommandId(trimmed, aliases);
    pendingCommandArgs.set(id, tokens.slice(1));
    try {
      if (isBlockedTerminalCommand(id)) {
        throw new Error(`Unknown command id: ${id}`);
      }
      await dispatch(id, { source: "terminal" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      write(`error: ${message}`, "error");
    } finally {
      pendingCommandArgs.delete(id);
    }
  }

  function prevHistory(): string | undefined {
    if (history.value.length === 0) {
      return undefined;
    }
    const nextIndex =
      historyCursor.value === -1 ? history.value.length - 1 : Math.max(0, historyCursor.value - 1);
    historyCursor.value = nextIndex;
    return history.value[nextIndex];
  }

  function nextHistory(): string | undefined {
    if (history.value.length === 0 || historyCursor.value === -1) {
      return undefined;
    }
    const nextIndex = historyCursor.value + 1;
    if (nextIndex >= history.value.length) {
      historyCursor.value = -1;
      return "";
    }
    historyCursor.value = nextIndex;
    return history.value[nextIndex];
  }

  function resetHistoryCursor(): void {
    historyCursor.value = -1;
  }

  return {
    scrollback,
    history,
    cwd,
    submit,
    prevHistory,
    nextHistory,
    resetHistoryCursor,
  };
}
