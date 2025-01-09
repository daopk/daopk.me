import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SLIDEV_PNPM_LOCKFILE_VERSION,
  SLIDEV_RUNTIME_COEP,
  SLIDEV_RUNTIME_PORT,
  SLIDEV_THEME_DEFAULT_VERSION,
} from "./runtimeProbe";
import {
  __resetSlidevRuntimeForTest,
  createSlidevRuntimeProjectTree,
  useSlidevRuntime,
  type SlidevRuntimeDeckInput,
} from "./useSlidevRuntime";
import type { SlidevRuntimeEnvironment, SlidevRuntimeProcess } from "./runtimeProbe";

function chromiumEnv(): SlidevRuntimeEnvironment {
  return {
    crossOriginIsolated: true,
    SharedArrayBuffer,
    location: { protocol: "https:", hostname: "example.com" } as Location,
    navigator: { userAgent: "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36" } as Navigator,
  };
}

function processWithExit(exitCode: number, output = "log"): SlidevRuntimeProcess {
  return {
    exit: Promise.resolve(exitCode),
    kill: vi.fn(),
    output: new ReadableStream<string>({
      start(controller) {
        controller.enqueue(output);
        controller.close();
      },
    }),
  };
}

function processWithControlledExit(output = ""): {
  readonly process: SlidevRuntimeProcess;
  readonly resolveExit: (exitCode: number) => void;
} {
  let resolveExit: (exitCode: number) => void = () => undefined;
  const exit = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });

  return {
    process: {
      exit,
      kill: vi.fn(),
      output: new ReadableStream<string>({
        start(controller) {
          if (output.length > 0) {
            controller.enqueue(output);
          }
        },
      }),
    },
    resolveExit,
  };
}

function makeRuntime() {
  const versionProcess = processWithExit(0, "8.15.9\n");
  const installProcess = processWithExit(0);
  const serverProcess = processWithExit(0);
  const writeFile = vi.fn(async () => undefined);
  let serverReady: ((port: number, url: string) => void) | undefined;
  const unsubscribe = vi.fn();
  const spawn = vi
    .fn()
    .mockResolvedValueOnce(versionProcess)
    .mockResolvedValueOnce(installProcess)
    .mockResolvedValueOnce(serverProcess);
  const webcontainer = {
    fs: { writeFile },
    mount: vi.fn(async () => undefined),
    on: vi.fn((_event: "server-ready", listener: (port: number, url: string) => void) => {
      serverReady = listener;
      return unsubscribe;
    }),
    spawn,
    teardown: vi.fn(),
  };
  const boot = vi.fn(async () => webcontainer);

  return {
    boot,
    installProcess,
    serverProcess,
    serverReady(port = SLIDEV_RUNTIME_PORT, url = "https://preview.local/") {
      serverReady?.(port, url);
    },
    spawn,
    unsubscribe,
    versionProcess,
    webcontainer,
    writeFile,
  };
}

const deck: SlidevRuntimeDeckInput = {
  slug: "demo",
  source: "# Demo",
};

function logText(bindings: ReturnType<typeof useSlidevRuntime>): string {
  return bindings.logs.value.join("\n");
}

describe("createSlidevRuntimeProjectTree", () => {
  it("generates an app-controlled Slidev project", () => {
    const tree = createSlidevRuntimeProjectTree("# Demo");

    expect(String(tree["package.json"]?.file?.contents)).toContain("@slidev/cli");
    expect(String(tree["package.json"]?.file?.contents)).toContain(
      `"@slidev/theme-default": "${SLIDEV_THEME_DEFAULT_VERSION}"`,
    );
    expect(String(tree[".npmrc"]?.file?.contents)).toContain("shamefully-hoist=true");
    expect(String(tree["pnpm-lock.yaml"]?.file?.contents)).toContain("@slidev/theme-default");
    expect(String(tree["pnpm-lock.yaml"]?.file?.contents)).toContain(
      `lockfileVersion: '${SLIDEV_PNPM_LOCKFILE_VERSION}'`,
    );
    expect(String(tree["slides.md"]?.file?.contents)).toBe("# Demo");
  });
});

describe("useSlidevRuntime", () => {
  afterEach(() => {
    __resetSlidevRuntimeForTest();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not boot when network access is denied", async () => {
    const runtime = makeRuntime();
    const bindings = useSlidevRuntime({
      environment: chromiumEnv(),
      loadWebContainerModule: async () => ({ WebContainer: { boot: runtime.boot } }),
      requestNetworkAccess: async () => false,
    });

    await expect(bindings.startDeck(deck)).resolves.toBe(false);

    expect(bindings.status.value).toBe("awaiting-network-consent");
    expect(logText(bindings)).toContain('Starting deck "demo".');
    expect(logText(bindings)).toContain("Network permission denied.");
    expect(runtime.boot).not.toHaveBeenCalled();
  });

  it("boots, mounts, installs, starts, and resolves preview URL", async () => {
    const runtime = makeRuntime();
    const bindings = useSlidevRuntime({
      environment: chromiumEnv(),
      loadWebContainerModule: async () => ({ WebContainer: { boot: runtime.boot } }),
    });

    const start = bindings.startDeck(deck);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    runtime.serverReady();

    await expect(start).resolves.toBe(true);
    expect(bindings.status.value).toBe("ready");
    expect(bindings.previewUrl.value).toBe("https://preview.local/");
    expect(runtime.boot).toHaveBeenCalledWith({
      coep: SLIDEV_RUNTIME_COEP,
      workdirName: "slides-runtime-spike",
      forwardPreviewErrors: "exceptions-only",
    });
    expect(runtime.webcontainer.mount).toHaveBeenCalledWith(
      createSlidevRuntimeProjectTree(deck.source),
    );
    expect(runtime.spawn).toHaveBeenCalledWith("pnpm", ["--version"]);
    expect(runtime.spawn).toHaveBeenCalledWith("pnpm", [
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--reporter=append-only",
    ]);
    expect(runtime.spawn).toHaveBeenCalledWith("pnpm", ["run", "dev"]);
    expect(logText(bindings)).toContain("Booting WebContainer");
    expect(logText(bindings)).toContain("WebContainer pnpm version detected: 8.15.9.");
    expect(logText(bindings)).toContain("Slidev dependencies ready.");
    expect(logText(bindings)).toContain("Received server-ready");
    expect(logText(bindings)).toContain("Preview ready at https://preview.local/");
  });

  it("writes slide changes into the active runtime filesystem", async () => {
    const runtime = makeRuntime();
    const bindings = useSlidevRuntime({
      environment: chromiumEnv(),
      loadWebContainerModule: async () => ({ WebContainer: { boot: runtime.boot } }),
    });

    const start = bindings.startDeck(deck);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    runtime.serverReady();
    await start;

    await expect(bindings.writeSlides("# Updated")).resolves.toBe(true);
    expect(runtime.writeFile).toHaveBeenCalledWith("slides.md", "# Updated");
    expect(logText(bindings)).toContain("Writing slides.md");
    expect(logText(bindings)).toContain("slides.md write completed.");
  });

  it("surfaces install failures", async () => {
    const runtime = makeRuntime();
    runtime.spawn.mockReset();
    runtime.spawn.mockResolvedValueOnce(processWithExit(0, "8.15.9\n"));
    runtime.spawn.mockResolvedValueOnce(processWithExit(1));
    const bindings = useSlidevRuntime({
      environment: chromiumEnv(),
      loadWebContainerModule: async () => ({ WebContainer: { boot: runtime.boot } }),
    });

    await expect(bindings.startDeck(deck)).resolves.toBe(false);

    expect(bindings.status.value).toBe("error");
    expect(bindings.error.value).toContain("install exited with code 1");
    expect(logText(bindings)).toContain("pnpm install exited with code 1.");
    expect(logText(bindings)).toContain("Runtime failed");
  });

  it("filters pnpm spinner escape noise from logs", async () => {
    const runtime = makeRuntime();
    runtime.spawn.mockReset();
    runtime.spawn
      .mockResolvedValueOnce(processWithExit(0, "8.15.9\n"))
      .mockResolvedValueOnce(processWithExit(0, "\u001B[1G\n\u001B[0K\n-\npnpm notice ready\n"))
      .mockResolvedValueOnce(processWithExit(0));
    const bindings = useSlidevRuntime({
      environment: chromiumEnv(),
      loadWebContainerModule: async () => ({ WebContainer: { boot: runtime.boot } }),
    });

    const start = bindings.startDeck(deck);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    runtime.serverReady();
    await expect(start).resolves.toBe(true);

    expect(logText(bindings)).toContain("pnpm notice ready");
    expect(logText(bindings)).not.toContain("[pnpm] -");
  });

  it("logs a heartbeat while pnpm install is still running", async () => {
    vi.useFakeTimers();
    const runtime = makeRuntime();
    const install = processWithControlledExit();
    runtime.spawn.mockReset();
    runtime.spawn
      .mockResolvedValueOnce(processWithExit(0, "8.15.9\n"))
      .mockResolvedValueOnce(install.process)
      .mockResolvedValueOnce(processWithExit(0));
    const bindings = useSlidevRuntime({
      environment: chromiumEnv(),
      loadWebContainerModule: async () => ({ WebContainer: { boot: runtime.boot } }),
    });

    const start = bindings.startDeck(deck);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(logText(bindings)).toContain("pnpm install still running after 10s.");

    install.resolveExit(0);
    await vi.advanceTimersByTimeAsync(0);
    runtime.serverReady();

    await expect(start).resolves.toBe(true);
  });
});
