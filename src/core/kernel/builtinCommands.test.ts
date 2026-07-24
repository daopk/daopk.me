import { describe, expect, it, vi } from "vitest";

import { buildBuiltinCommands, registerBuiltinCommands } from "./builtinCommands";
import { CommandRegistry } from "./CommandRegistry";
import type { CommandContext, CommandManifest } from "~/types/command";
import type { Kernel } from "~/types/kernel";

interface FakeKernelHandles {
  kernel: Kernel;
  appsLaunch: ReturnType<typeof vi.fn>;
  themeCurrent: ReturnType<typeof vi.fn>;
  themeSetTheme: ReturnType<typeof vi.fn>;
  eventsEmit: ReturnType<typeof vi.fn>;
  commandsRegister: ReturnType<typeof vi.fn>;
  profileLock: ReturnType<typeof vi.fn>;
}

function makeFakeKernel(initialTheme: "light" | "dark" = "light"): FakeKernelHandles {
  const appsLaunch = vi.fn(async () => ({ id: "stub", manifestId: "about" }));
  let currentTheme = initialTheme;
  const themeCurrent = vi.fn(() => currentTheme);
  const themeSetTheme = vi.fn((name: "light" | "dark" | "system") => {
    if (name === "light" || name === "dark") {
      currentTheme = name;
    }
  });
  const eventsEmit = vi.fn();
  const profileLock = vi.fn(async () => undefined);
  const disposers: Array<() => void> = [];
  const commandsRegister = vi.fn((_manifest: CommandManifest) => {
    const dispose = vi.fn();
    disposers.push(dispose);
    return dispose;
  });

  const kernel = {
    apps: {
      launch: appsLaunch,
      list: () => [
        { id: "about" },
        { id: "browser" },
        { id: "editor" },
        { id: "finder" },
        { id: "notes" },
        { id: "pdf-viewer" },
        { id: "settings" },
        { id: "terminal" },
      ],
    },
    theme: { current: themeCurrent, setTheme: themeSetTheme },
    events: { emit: eventsEmit },
    commands: { register: commandsRegister },
    profile: { lock: profileLock },
  } as unknown as Kernel;

  return {
    kernel,
    appsLaunch,
    themeCurrent,
    themeSetTheme,
    eventsEmit,
    commandsRegister,
    profileLock,
  };
}

function makeCtx(kernel: Kernel): CommandContext {
  return {
    kernel,
    source: "api",
    activeHandle: null,
    payload: Object.freeze({}),
    signal: new AbortController().signal,
  };
}

function findCommand(kernel: Kernel, id: string): CommandManifest {
  const command = buildBuiltinCommands(kernel).find((c) => c.id === id);
  if (!command) {
    throw new Error(`Built-in command not found: ${id}`);
  }
  return command;
}

function makeRegistryBackedKernel(): Kernel {
  const registry = new CommandRegistry();

  return {
    commands: {
      register: registry.register.bind(registry),
      list: registry.list.bind(registry),
    },
  } as unknown as Kernel;
}

describe("builtinCommands — manifest catalog (M2a.2)", () => {
  it("declares the built-in command ids", () => {
    const { kernel } = makeFakeKernel();
    const ids = buildBuiltinCommands(kernel).map((c) => c.id);

    expect(ids).toEqual([
      "app:open",
      "app:spawnNew",
      "spotlight:open",
      "settings:openSection",
      "widgets:openGallery",
      "system:lock",
      "finder:open",
      "browser:open",
      "editor:open",
      "notes:open",
      "pdf-viewer:open",
      "theme:toggle",
      "theme:setLight",
      "theme:setDark",
    ]);
  });

  it("internal menu commands are scope='shell'; public commands are scope='global'", () => {
    const { kernel } = makeFakeKernel();
    const catalog = buildBuiltinCommands(kernel);
    const shellIds = new Set([
      "app:open",
      "app:spawnNew",
      "spotlight:open",
      "settings:openSection",
      "widgets:openGallery",
    ]);

    for (const command of catalog) {
      if (shellIds.has(command.id)) {
        expect(command.scope).toBe("shell");
      } else {
        expect(command.scope).toBe("global");
      }
    }
  });

  it("theme:toggle declares the Meta+Shift+T shortcut hint", () => {
    const { kernel } = makeFakeKernel();
    const cmd = findCommand(kernel, "theme:toggle");

    expect(cmd.shortcut).toBe("Meta+Shift+T");
  });
});

describe("builtinCommands — run() behavior (M2a.2)", () => {
  it("app:open emits app.launch.requested for the payload manifestId", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "app:open");

    await cmd.run({
      ...makeCtx(handles.kernel),
      source: "menu",
      payload: { manifestId: "finder" },
    });

    expect(handles.eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "finder",
      source: "menu",
    });
  });

  it("app:spawnNew emits app.spawn.new for the payload manifestId", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "app:spawnNew");

    await cmd.run({
      ...makeCtx(handles.kernel),
      source: "menu",
      payload: { manifestId: "terminal" },
    });

    expect(handles.eventsEmit).toHaveBeenCalledWith("app.spawn.new", {
      manifestId: "terminal",
      source: "menu",
    });
  });

  it("spotlight:open emits spotlight.open.requested with the dispatch source", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "spotlight:open");

    await cmd.run({ ...makeCtx(handles.kernel), source: "menu" });

    expect(handles.eventsEmit).toHaveBeenCalledWith("spotlight.open.requested", {
      source: "menu",
    });
  });

  it("settings:openSection launches Settings with the payload section", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "settings:openSection");

    await cmd.run({
      ...makeCtx(handles.kernel),
      source: "menu",
      payload: { section: "dock" },
    });

    expect(handles.eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "settings",
      source: "menu",
      args: { section: "dock" },
    });
  });

  it("widgets:openGallery emits widget.gallery.open.requested with the dispatch source", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "widgets:openGallery");

    await cmd.run({ ...makeCtx(handles.kernel), source: "menu" });

    expect(handles.eventsEmit).toHaveBeenCalledWith("widget.gallery.open.requested", {
      source: "menu",
    });
  });

  it("payload-driven commands no-op when required payload is missing", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "app:open");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.eventsEmit).not.toHaveBeenCalled();
  });

  it("system:lock soft-locks the current profile", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "system:lock");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.profileLock).toHaveBeenCalledTimes(1);
  });

  it("finder:open emits app.launch.requested for 'finder'", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "finder:open");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "finder",
      source: "api",
    });
  });

  it("browser:open emits app.launch.requested for 'browser'", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "browser:open");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "browser",
      source: "api",
    });
  });

  it("editor:open emits app.launch.requested for 'editor'", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "editor:open");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "editor",
      source: "api",
    });
  });

  it("notes:open emits app.launch.requested for 'notes'", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "notes:open");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "notes",
      source: "api",
    });
  });

  it("pdf-viewer:open emits app.launch.requested for 'pdf-viewer'", async () => {
    const handles = makeFakeKernel();
    const cmd = findCommand(handles.kernel, "pdf-viewer:open");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.eventsEmit).toHaveBeenCalledWith("app.launch.requested", {
      manifestId: "pdf-viewer",
      source: "api",
    });
  });

  it("theme:toggle flips light → dark", async () => {
    const handles = makeFakeKernel("light");
    const cmd = findCommand(handles.kernel, "theme:toggle");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.themeSetTheme).toHaveBeenCalledWith("dark");
  });

  it("theme:toggle flips dark → light", async () => {
    const handles = makeFakeKernel("dark");
    const cmd = findCommand(handles.kernel, "theme:toggle");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.themeSetTheme).toHaveBeenCalledWith("light");
  });

  it("theme:setLight always sets light", async () => {
    const handles = makeFakeKernel("dark");
    const cmd = findCommand(handles.kernel, "theme:setLight");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.themeSetTheme).toHaveBeenCalledWith("light");
  });

  it("theme:setDark always sets dark", async () => {
    const handles = makeFakeKernel("light");
    const cmd = findCommand(handles.kernel, "theme:setDark");

    await cmd.run(makeCtx(handles.kernel));

    expect(handles.themeSetTheme).toHaveBeenCalledWith("dark");
  });
});

describe("registerBuiltinCommands — wiring (M2a.2)", () => {
  it("registers every catalog entry via kernel.commands.register", () => {
    const handles = makeFakeKernel();

    registerBuiltinCommands(handles.kernel);

    expect(handles.commandsRegister).toHaveBeenCalledTimes(14);
    const registeredIds = handles.commandsRegister.mock.calls.map(
      ([manifest]) => (manifest as CommandManifest).id,
    );
    expect(registeredIds).toEqual([
      "app:open",
      "app:spawnNew",
      "spotlight:open",
      "settings:openSection",
      "widgets:openGallery",
      "system:lock",
      "finder:open",
      "browser:open",
      "editor:open",
      "notes:open",
      "pdf-viewer:open",
      "theme:toggle",
      "theme:setLight",
      "theme:setDark",
    ]);
  });

  it("returned disposer calls every per-command disposer", () => {
    const handles = makeFakeKernel();

    const dispose = registerBuiltinCommands(handles.kernel);

    const perCommandDisposers = handles.commandsRegister.mock.results.map(
      (r) => r.value as ReturnType<typeof vi.fn>,
    );

    dispose();

    for (const d of perCommandDisposers) {
      expect(d).toHaveBeenCalledTimes(1);
    }
  });
});

describe("kernel built-ins — CommandRegistry integration (M2a.2)", () => {
  it("registerBuiltinCommands surfaces all ids through a registry-backed command facade", () => {
    const kernel = makeRegistryBackedKernel();

    const dispose = registerBuiltinCommands(kernel);

    const listed = kernel.commands.list().map((c) => c.id);
    expect(listed).toContain("app:open");
    expect(listed).toContain("app:spawnNew");
    expect(listed).toContain("spotlight:open");
    expect(listed).toContain("settings:openSection");
    expect(listed).toContain("widgets:openGallery");
    expect(listed).toContain("system:lock");
    expect(listed).toContain("finder:open");
    expect(listed).toContain("browser:open");
    expect(listed).toContain("editor:open");
    expect(listed).toContain("pdf-viewer:open");
    expect(listed).toContain("theme:toggle");
    expect(listed).toContain("theme:setLight");
    expect(listed).toContain("theme:setDark");

    dispose();

    const afterDispose = kernel.commands.list().map((c) => c.id);
    expect(afterDispose).not.toContain("finder:open");
    expect(afterDispose).not.toContain("browser:open");
    expect(afterDispose).not.toContain("editor:open");
    expect(afterDispose).not.toContain("pdf-viewer:open");
    expect(afterDispose).not.toContain("widgets:openGallery");
    expect(afterDispose).not.toContain("system:lock");
  });
});
