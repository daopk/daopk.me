import type { FileSystemTree, WebContainer, WebContainerProcess } from "@webcontainer/api";

import { toErrorMessage } from "~/utils/errors";

import runtimePnpmLock from "./runtime-pnpm-lock.yaml?raw";

export const SLIDEV_RUNTIME_COEP = "credentialless";
export const SLIDEV_RUNTIME_PORT = 3030;
export const SLIDEV_CLI_VERSION = "52.14.1";
export const SLIDEV_THEME_DEFAULT_VERSION = "0.25.0";
export const SLIDEV_PNPM_LOCKFILE_VERSION = "6.0";
export const SLIDEV_RUNTIME_WORKDIR = "slides-runtime-spike";
export const SLIDEV_RUNTIME_READY_TIMEOUT_MS = 60_000;

export type SlidevRuntimeBlockReason =
  | "not-browser"
  | "headers-missing"
  | "shared-array-buffer-missing"
  | "insecure-context"
  | "unsupported-browser";

export type SlidevRuntimeFailureReason =
  | SlidevRuntimeBlockReason
  | "boot-failed"
  | "storage-blocked"
  | "install-failed"
  | "server-failed";

export type SlidevRuntimeSupportResult =
  | {
      readonly supported: true;
    }
  | {
      readonly supported: false;
      readonly reason: SlidevRuntimeBlockReason;
      readonly message: string;
    };

export interface SlidevRuntimeEnvironment {
  readonly crossOriginIsolated?: boolean;
  readonly SharedArrayBuffer?: unknown;
  readonly location?: Pick<Location, "hostname" | "protocol">;
  readonly navigator?: Pick<Navigator, "userAgent"> & {
    readonly userAgentData?: {
      readonly brands?: readonly { readonly brand: string; readonly version: string }[];
    };
  };
}

export interface SlidevRuntimeProbeOptions {
  readonly environment?: SlidevRuntimeEnvironment;
  readonly loadWebContainerModule?: () => Promise<SlidevRuntimeWebContainerModule>;
  readonly onLog?: (chunk: string) => void;
  readonly readyTimeoutMs?: number;
}

export interface SlidevRuntimeProbeResult {
  readonly port: number;
  readonly url: string;
  readonly cleanup: () => void;
}

export interface SlidevRuntimeWebContainerModule {
  readonly WebContainer: {
    boot(options?: {
      coep?: typeof SLIDEV_RUNTIME_COEP;
      workdirName?: string;
      forwardPreviewErrors?: boolean | "exceptions-only";
    }): Promise<SlidevRuntimeWebContainer>;
  };
}

export type SlidevRuntimeWebContainer = Pick<WebContainer, "mount" | "on" | "spawn" | "teardown">;

export type SlidevRuntimeProcess = Pick<WebContainerProcess, "exit" | "kill" | "output">;

export class SlidevRuntimeProbeError extends Error {
  readonly reason: SlidevRuntimeFailureReason;

  constructor(reason: SlidevRuntimeFailureReason, message: string) {
    super(message);
    this.name = "SlidevRuntimeProbeError";
    this.reason = reason;
  }
}

const STARTER_SLIDES = `---
theme: default
title: WebOS Slides Runtime Spike
---

# WebOS Slides

Slidev is running inside WebContainer.

---

## Runtime Check

\`\`\`ts
console.log("hello from Slidev")
\`\`\`
`;

export function detectSlidevRuntimeSupport(
  environment: SlidevRuntimeEnvironment = globalThis,
): SlidevRuntimeSupportResult {
  if (typeof window === "undefined" || environment.location === undefined) {
    return blocked("not-browser", "Slides runtime needs a browser environment.");
  }

  if (environment.crossOriginIsolated !== true) {
    return blocked(
      "headers-missing",
      "Slides runtime needs COOP/COEP headers before WebContainer can boot.",
    );
  }

  if (typeof environment.SharedArrayBuffer !== "function") {
    return blocked(
      "shared-array-buffer-missing",
      "Slides runtime needs SharedArrayBuffer support.",
    );
  }

  if (!isSecureRuntimeOrigin(environment.location)) {
    return blocked(
      "insecure-context",
      "Slides runtime needs HTTPS, localhost, or loopback hosting.",
    );
  }

  if (!isLikelyChromium(environment.navigator)) {
    return blocked(
      "unsupported-browser",
      "Slides runtime needs a Chromium-class browser for WebContainer.",
    );
  }

  return { supported: true };
}

export function createSlidevRuntimeSpikeFileTree(): FileSystemTree {
  return {
    "package.json": {
      file: {
        contents: `${JSON.stringify(
          {
            name: "webos-slidev-runtime-spike",
            private: true,
            type: "module",
            scripts: {
              dev: `slidev slides.md --port ${SLIDEV_RUNTIME_PORT} --bind 0.0.0.0`,
            },
            dependencies: {
              "@slidev/cli": SLIDEV_CLI_VERSION,
              "@slidev/theme-default": SLIDEV_THEME_DEFAULT_VERSION,
            },
          },
          null,
          2,
        )}\n`,
      },
    },
    ".npmrc": {
      file: {
        contents: "shamefully-hoist=true\n",
      },
    },
    "pnpm-lock.yaml": {
      file: {
        contents: runtimePnpmLock,
      },
    },
    "slides.md": {
      file: {
        contents: STARTER_SLIDES,
      },
    },
  };
}

export async function runSlidevRuntimeProbe(
  options: SlidevRuntimeProbeOptions = {},
): Promise<SlidevRuntimeProbeResult> {
  const support = detectSlidevRuntimeSupport(options.environment);
  if (!support.supported) {
    throw new SlidevRuntimeProbeError(support.reason, support.message);
  }

  const module = await loadWebContainerModule(options.loadWebContainerModule);
  const webcontainer = await bootWebContainer(module);
  await mountRuntimeSpike(webcontainer);
  await installRuntimeDependencies(webcontainer, options.onLog);

  return await startSlidevServer(webcontainer, {
    onLog: options.onLog,
    readyTimeoutMs: options.readyTimeoutMs ?? SLIDEV_RUNTIME_READY_TIMEOUT_MS,
  });
}

async function loadWebContainerModule(
  loader: SlidevRuntimeProbeOptions["loadWebContainerModule"],
): Promise<SlidevRuntimeWebContainerModule> {
  try {
    if (loader !== undefined) {
      return await loader();
    }

    return await import("@webcontainer/api");
  } catch (error) {
    throw new SlidevRuntimeProbeError("boot-failed", toErrorMessage(error));
  }
}

async function bootWebContainer(
  module: SlidevRuntimeWebContainerModule,
): Promise<SlidevRuntimeWebContainer> {
  try {
    return await module.WebContainer.boot({
      coep: SLIDEV_RUNTIME_COEP,
      workdirName: SLIDEV_RUNTIME_WORKDIR,
      forwardPreviewErrors: "exceptions-only",
    });
  } catch (error) {
    throw new SlidevRuntimeProbeError("boot-failed", toErrorMessage(error));
  }
}

async function mountRuntimeSpike(webcontainer: SlidevRuntimeWebContainer): Promise<void> {
  try {
    await webcontainer.mount(createSlidevRuntimeSpikeFileTree());
  } catch (error) {
    throw new SlidevRuntimeProbeError("storage-blocked", toErrorMessage(error));
  }
}

async function installRuntimeDependencies(
  webcontainer: SlidevRuntimeWebContainer,
  onLog?: (chunk: string) => void,
): Promise<void> {
  try {
    await checkPnpmVersion(webcontainer, onLog);
    const install = (await webcontainer.spawn("pnpm", [
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
      "--reporter=append-only",
    ])) as SlidevRuntimeProcess;
    const stopReading = readProcessOutput(install, onLog);
    const exitCode = await install.exit;
    stopReading();
    if (exitCode !== 0) {
      throw new SlidevRuntimeProbeError(
        "install-failed",
        `Slidev dependency install exited with code ${exitCode}.`,
      );
    }
  } catch (error) {
    if (error instanceof SlidevRuntimeProbeError) {
      throw error;
    }

    throw new SlidevRuntimeProbeError("install-failed", toErrorMessage(error));
  }
}

async function checkPnpmVersion(
  webcontainer: SlidevRuntimeWebContainer,
  onLog?: (chunk: string) => void,
): Promise<void> {
  onLog?.(`Checking WebContainer pnpm version for lockfile v${SLIDEV_PNPM_LOCKFILE_VERSION}.\n`);
  const versionCheck = (await webcontainer.spawn("pnpm", ["--version"])) as SlidevRuntimeProcess;
  const versionOutput = captureProcessOutput(versionCheck, onLog);
  const [exitCode, output] = await Promise.all([versionCheck.exit, versionOutput]);
  const version = output.trim();
  if (version.length > 0) {
    onLog?.(`WebContainer pnpm version detected: ${version}.\n`);
  }

  if (exitCode !== 0) {
    throw new SlidevRuntimeProbeError(
      "install-failed",
      `pnpm --version exited with code ${exitCode}.`,
    );
  }
}

async function startSlidevServer(
  webcontainer: SlidevRuntimeWebContainer,
  options: { readonly onLog?: (chunk: string) => void; readonly readyTimeoutMs: number },
): Promise<SlidevRuntimeProbeResult> {
  let serverProcess: SlidevRuntimeProcess | undefined;
  let unsubscribeServerReady: (() => void) | undefined;

  try {
    const ready = new Promise<SlidevRuntimeProbeResult>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        reject(
          new SlidevRuntimeProbeError(
            "server-failed",
            "Slidev server did not become ready before the timeout.",
          ),
        );
      }, options.readyTimeoutMs);

      unsubscribeServerReady = webcontainer.on("server-ready", (port, url) => {
        if (port !== SLIDEV_RUNTIME_PORT) {
          return;
        }

        globalThis.clearTimeout(timeout);
        unsubscribeServerReady?.();
        resolve({
          port,
          url,
          cleanup() {
            unsubscribeServerReady?.();
            serverProcess?.kill();
          },
        });
      });
    });

    serverProcess = (await webcontainer.spawn("pnpm", ["run", "dev"])) as SlidevRuntimeProcess;
    readProcessOutput(serverProcess, options.onLog);
    serverProcess.exit.catch(() => undefined);

    return await ready;
  } catch (error) {
    unsubscribeServerReady?.();
    serverProcess?.kill();

    if (error instanceof SlidevRuntimeProbeError) {
      throw error;
    }

    throw new SlidevRuntimeProbeError("server-failed", toErrorMessage(error));
  }
}

function readProcessOutput(
  process: Pick<SlidevRuntimeProcess, "output">,
  onLog?: (chunk: string) => void,
): () => void {
  if (onLog === undefined) {
    return () => undefined;
  }

  const reader = process.output.getReader();
  let cancelled = false;

  void (async () => {
    try {
      while (!cancelled) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        onLog(next.value);
      }
    } catch {
    } finally {
      reader.releaseLock();
    }
  })();

  return () => {
    cancelled = true;
    void reader.cancel().catch(() => undefined);
  };
}

async function captureProcessOutput(
  process: Pick<SlidevRuntimeProcess, "output">,
  onLog?: (chunk: string) => void,
): Promise<string> {
  const reader = process.output.getReader();
  const chunks: string[] = [];

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      chunks.push(next.value);
      onLog?.(next.value);
    }
  } catch {
  } finally {
    reader.releaseLock();
  }

  return chunks.join("");
}

function blocked(
  reason: SlidevRuntimeBlockReason,
  message: string,
): Extract<SlidevRuntimeSupportResult, { supported: false }> {
  return { supported: false, reason, message };
}

function isSecureRuntimeOrigin(location: Pick<Location, "hostname" | "protocol">): boolean {
  if (location.protocol === "https:") {
    return true;
  }

  return (
    location.protocol === "http:" &&
    (location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname === "::1")
  );
}

function isLikelyChromium(environmentNavigator: SlidevRuntimeEnvironment["navigator"]): boolean {
  const brands = environmentNavigator?.userAgentData?.brands ?? [];
  if (brands.some((brand) => /chrom/i.test(brand.brand))) {
    return true;
  }

  const userAgent = environmentNavigator?.userAgent ?? "";
  return (
    /(?:Chrome|Chromium|Edg)\//.test(userAgent) && !/(?:Firefox|OPR|CriOS|FxiOS)\//.test(userAgent)
  );
}
