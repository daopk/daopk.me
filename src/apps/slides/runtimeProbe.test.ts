import { describe, expect, it, vi } from "vitest";

import {
  SLIDEV_CLI_VERSION,
  SLIDEV_PNPM_LOCKFILE_VERSION,
  SLIDEV_RUNTIME_COEP,
  SLIDEV_RUNTIME_PORT,
  SLIDEV_THEME_DEFAULT_VERSION,
  createSlidevRuntimeSpikeFileTree,
  detectSlidevRuntimeSupport,
  runSlidevRuntimeProbe,
  SlidevRuntimeProbeError,
  type SlidevRuntimeEnvironment,
  type SlidevRuntimeProcess,
  type SlidevRuntimeWebContainer,
} from "./runtimeProbe";

function chromiumEnv(overrides: Partial<SlidevRuntimeEnvironment> = {}): SlidevRuntimeEnvironment {
  return {
    crossOriginIsolated: true,
    SharedArrayBuffer,
    location: { protocol: "https:", hostname: "example.com" } as Location,
    navigator: { userAgent: "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36" } as Navigator,
    ...overrides,
  };
}

function processWithExit(exitCode: number, output = "ok"): SlidevRuntimeProcess {
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

describe("detectSlidevRuntimeSupport", () => {
  it("requires cross-origin isolation", () => {
    expect(detectSlidevRuntimeSupport(chromiumEnv({ crossOriginIsolated: false }))).toEqual({
      supported: false,
      reason: "headers-missing",
      message: "Slides runtime needs COOP/COEP headers before WebContainer can boot.",
    });
  });

  it("allows localhost without https", () => {
    expect(
      detectSlidevRuntimeSupport(
        chromiumEnv({ location: { protocol: "http:", hostname: "localhost" } as Location }),
      ),
    ).toEqual({ supported: true });
  });

  it("blocks insecure non-local origins", () => {
    expect(
      detectSlidevRuntimeSupport(
        chromiumEnv({ location: { protocol: "http:", hostname: "example.com" } as Location }),
      ),
    ).toEqual({
      supported: false,
      reason: "insecure-context",
      message: "Slides runtime needs HTTPS, localhost, or loopback hosting.",
    });
  });
});

describe("createSlidevRuntimeSpikeFileTree", () => {
  it("pins Slidev CLI and exposes the spike deck", () => {
    const tree = createSlidevRuntimeSpikeFileTree();
    const packageJson = tree["package.json"]?.file?.contents;
    const slides = tree["slides.md"]?.file?.contents;

    expect(String(packageJson)).toContain(`"@slidev/cli": "${SLIDEV_CLI_VERSION}"`);
    expect(String(packageJson)).toContain(
      `"@slidev/theme-default": "${SLIDEV_THEME_DEFAULT_VERSION}"`,
    );
    expect(String(packageJson)).toContain(`--port ${SLIDEV_RUNTIME_PORT}`);
    expect(String(packageJson)).toContain("--bind 0.0.0.0");
    expect(String(tree[".npmrc"]?.file?.contents)).toContain("shamefully-hoist=true");
    expect(String(tree["pnpm-lock.yaml"]?.file?.contents)).toContain("@slidev/theme-default");
    expect(String(tree["pnpm-lock.yaml"]?.file?.contents)).toContain(
      `lockfileVersion: '${SLIDEV_PNPM_LOCKFILE_VERSION}'`,
    );
    expect(String(slides)).toContain("Slidev is running inside WebContainer.");
  });
});

describe("runSlidevRuntimeProbe", () => {
  it("boots, installs, starts Slidev, and resolves on server-ready", async () => {
    const version = processWithExit(0, "8.15.9\n");
    const install = processWithExit(0);
    const server = processWithExit(0);
    let serverReady: ((port: number, url: string) => void) | undefined;
    const unsubscribe = vi.fn();
    const webcontainer: SlidevRuntimeWebContainer = {
      mount: vi.fn(async () => undefined),
      on: vi.fn((_event, listener) => {
        serverReady = listener;
        return unsubscribe;
      }),
      spawn: vi.fn(async (command: string, args: readonly string[]) =>
        command === "pnpm" && args[0] === "--version"
          ? version
          : command === "pnpm" && args[0] === "install"
            ? install
            : server,
      ),
      teardown: vi.fn(),
    };
    const boot = vi.fn(async () => webcontainer);

    const probe = runSlidevRuntimeProbe({
      environment: chromiumEnv(),
      loadWebContainerModule: async () => ({ WebContainer: { boot } }),
    });

    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    serverReady?.(SLIDEV_RUNTIME_PORT, "https://preview.local/");

    await expect(probe).resolves.toMatchObject({
      port: SLIDEV_RUNTIME_PORT,
      url: "https://preview.local/",
    });
    expect(boot).toHaveBeenCalledWith({
      coep: SLIDEV_RUNTIME_COEP,
      workdirName: "slides-runtime-spike",
      forwardPreviewErrors: "exceptions-only",
    });
    expect(webcontainer.mount).toHaveBeenCalled();
    expect(webcontainer.spawn).toHaveBeenCalledWith("pnpm", ["--version"]);
    expect(webcontainer.spawn).toHaveBeenCalledWith("pnpm", [
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--reporter=append-only",
    ]);
    expect(webcontainer.spawn).toHaveBeenCalledWith("pnpm", ["run", "dev"]);
  });

  it("surfaces install failures", async () => {
    const version = processWithExit(0, "8.15.9\n");
    const install = processWithExit(1);
    const webcontainer: SlidevRuntimeWebContainer = {
      mount: vi.fn(async () => undefined),
      on: vi.fn(() => vi.fn()),
      spawn: vi.fn(async (_command: string, args: readonly string[]) =>
        args[0] === "--version" ? version : install,
      ),
      teardown: vi.fn(),
    };

    await expect(
      runSlidevRuntimeProbe({
        environment: chromiumEnv(),
        loadWebContainerModule: async () => ({ WebContainer: { boot: async () => webcontainer } }),
      }),
    ).rejects.toMatchObject({
      reason: "install-failed",
    } satisfies Partial<SlidevRuntimeProbeError>);
  });
});
