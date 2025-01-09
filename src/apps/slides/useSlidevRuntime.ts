import { computed, ref, type ComputedRef, type Ref } from "vue";

import type { FileSystemTree, WebContainer } from "@webcontainer/api";

import {
  SLIDEV_CLI_VERSION,
  SLIDEV_PNPM_LOCKFILE_VERSION,
  SLIDEV_RUNTIME_COEP,
  SLIDEV_RUNTIME_PORT,
  SLIDEV_RUNTIME_READY_TIMEOUT_MS,
  SLIDEV_RUNTIME_WORKDIR,
  SLIDEV_THEME_DEFAULT_VERSION,
  SlidevRuntimeProbeError,
  detectSlidevRuntimeSupport,
  type SlidevRuntimeEnvironment,
  type SlidevRuntimeFailureReason,
  type SlidevRuntimeProcess,
  type SlidevRuntimeWebContainerModule,
} from "./runtimeProbe";
import runtimePnpmLock from "./runtime-pnpm-lock.yaml?raw";

export type SlidevRuntimeStatus =
  | "unsupported"
  | "idle"
  | "awaiting-network-consent"
  | "booting"
  | "installing"
  | "starting"
  | "ready"
  | "error";

export interface SlidevRuntimeDeckInput {
  readonly slug: string;
  readonly source: string;
}

export interface SlidevRuntimeBindings {
  readonly status: Ref<SlidevRuntimeStatus>;
  readonly error: Ref<string>;
  readonly logs: Ref<readonly string[]>;
  readonly previewUrl: Ref<string>;
  readonly ready: ComputedRef<boolean>;
  readonly supported: ComputedRef<boolean>;
  startDeck(deck: SlidevRuntimeDeckInput): Promise<boolean>;
  writeSlides(source: string): Promise<boolean>;
  stop(): void;
  dispose(): void;
}

export interface UseSlidevRuntimeOptions {
  readonly environment?: SlidevRuntimeEnvironment;
  readonly loadWebContainerModule?: () => Promise<SlidevRuntimeWebContainerModule>;
  readonly requestNetworkAccess?: () => Promise<boolean>;
  readonly readyTimeoutMs?: number;
}

type SlidevRuntimeWebContainer = Pick<WebContainer, "mount" | "on" | "spawn" | "teardown"> & {
  readonly fs: Pick<WebContainer["fs"], "writeFile">;
};

const MAX_RUNTIME_LOGS = 300;
const PROCESS_HEARTBEAT_INTERVAL_MS = 10_000;
const ESCAPE_CHARACTER = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${ESCAPE_CHARACTER}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`,
  "g",
);
const PROCESS_SPINNER_PATTERN = /^(?:[-\\/|]|[.]+)$/;

let bootPromise: Promise<SlidevRuntimeWebContainer> | undefined;
let installPromise: Promise<void> | undefined;
let serverProcess: SlidevRuntimeProcess | undefined;
let unsubscribeServerReady: (() => void) | undefined;
let runtimeGeneration = 0;

export function useSlidevRuntime(options: UseSlidevRuntimeOptions = {}): SlidevRuntimeBindings {
  const support = detectSlidevRuntimeSupport(options.environment);
  const status = ref<SlidevRuntimeStatus>(support.supported ? "idle" : "unsupported");
  const error = ref(support.supported ? "" : support.message);
  const logs = ref<readonly string[]>([]);
  const previewUrl = ref("");

  const ready = computed(() => status.value === "ready");
  const supported = computed(() => support.supported);

  if (!support.supported) {
    appendLifecycleLog(`Unsupported runtime: ${support.message}`);
  }

  function appendLifecycleLog(chunk: string): void {
    appendRuntimeLog("webcontainer", chunk);
  }

  function appendRuntimeLog(source: string, chunk: string): void {
    const lines = chunk
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => cleanRuntimeLogLine(source, line))
      .filter((line): line is string => line !== null);

    if (lines.length === 0) {
      return;
    }

    const timestamp = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
    const entries = lines.map((line) => `${timestamp} [${source}] ${line}`);
    logs.value = [...logs.value, ...entries].slice(-MAX_RUNTIME_LOGS);
  }

  async function startDeck(deck: SlidevRuntimeDeckInput): Promise<boolean> {
    logs.value = [];
    appendLifecycleLog(`Starting deck "${deck.slug}".`);

    if (!support.supported) {
      status.value = "unsupported";
      error.value = support.message;
      appendLifecycleLog(`Runtime support check failed: ${support.message}`);
      return false;
    }

    appendLifecycleLog("Requesting network permission for Slidev dependency install.");
    if (options.requestNetworkAccess !== undefined && !(await options.requestNetworkAccess())) {
      status.value = "awaiting-network-consent";
      error.value = "Slides needs network access to install the pinned Slidev runtime.";
      appendLifecycleLog("Network permission denied.");
      return false;
    }
    appendLifecycleLog("Network permission granted or not required.");

    const generation = ++runtimeGeneration;
    previewUrl.value = "";
    error.value = "";

    try {
      status.value = "booting";
      appendLifecycleLog(
        `Booting WebContainer (coep=${SLIDEV_RUNTIME_COEP}, workdir=${SLIDEV_RUNTIME_WORKDIR}).`,
      );
      const webcontainer = await bootRuntime(options.loadWebContainerModule, appendLifecycleLog);
      if (!isActiveGeneration(generation)) return false;

      await prepareProject(webcontainer, deck.source, appendLifecycleLog);
      if (!isActiveGeneration(generation)) return false;

      status.value = "installing";
      await installRuntime(webcontainer, {
        generation,
        onLifecycleLog: appendLifecycleLog,
        onProcessLog: (chunk) => appendRuntimeLog("pnpm", chunk),
      });
      if (!isActiveGeneration(generation)) return false;

      status.value = "starting";
      stopServer(appendLifecycleLog);
      const url = await startServer(webcontainer, {
        generation,
        onLifecycleLog: appendLifecycleLog,
        onProcessLog: (chunk) => appendRuntimeLog("slidev", chunk),
        readyTimeoutMs: options.readyTimeoutMs ?? SLIDEV_RUNTIME_READY_TIMEOUT_MS,
      });
      if (!isActiveGeneration(generation)) return false;

      previewUrl.value = url;
      status.value = "ready";
      appendLifecycleLog(`Preview ready at ${url}`);
      return true;
    } catch (runtimeError) {
      if (!isActiveGeneration(generation)) {
        return false;
      }

      const mapped = mapRuntimeError(runtimeError);
      status.value = mapped.status;
      error.value = mapped.message;
      appendLifecycleLog(`Runtime failed: ${mapped.message}`);
      return false;
    }
  }

  async function writeSlides(source: string): Promise<boolean> {
    if (bootPromise === undefined) {
      error.value = "Start a slide deck before writing preview changes.";
      return false;
    }

    try {
      appendLifecycleLog(`Writing slides.md (${source.length} characters).`);
      const webcontainer = await bootPromise;
      await webcontainer.fs.writeFile("slides.md", source);
      appendLifecycleLog("slides.md write completed.");
      return true;
    } catch (writeError) {
      status.value = "error";
      error.value = messageFromError(writeError);
      appendLifecycleLog(`slides.md write failed: ${error.value}`);
      return false;
    }
  }

  function stop(): void {
    runtimeGeneration++;
    previewUrl.value = "";
    stopServer(appendLifecycleLog);
    if (support.supported) {
      status.value = "idle";
      error.value = "";
      appendLifecycleLog("Runtime stopped.");
    }
  }

  function dispose(): void {
    stop();
  }

  return {
    status,
    error,
    logs,
    previewUrl,
    ready,
    supported,
    startDeck,
    writeSlides,
    stop,
    dispose,
  };
}

export function createSlidevRuntimeProjectTree(source: string): FileSystemTree {
  return {
    "package.json": {
      file: {
        contents: `${JSON.stringify(
          {
            name: "webos-slidev-runtime",
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
        contents: source,
      },
    },
  };
}

export function __resetSlidevRuntimeForTest(): void {
  stopServer();
  bootPromise = undefined;
  installPromise = undefined;
  runtimeGeneration = 0;
}

async function bootRuntime(
  loader: UseSlidevRuntimeOptions["loadWebContainerModule"],
  onLog: (chunk: string) => void,
): Promise<SlidevRuntimeWebContainer> {
  if (bootPromise === undefined) {
    onLog("Loading @webcontainer/api module.");
    bootPromise = (async () => {
      const module = loader === undefined ? await import("@webcontainer/api") : await loader();
      onLog("Calling WebContainer.boot.");
      const webcontainer = (await module.WebContainer.boot({
        coep: SLIDEV_RUNTIME_COEP,
        workdirName: SLIDEV_RUNTIME_WORKDIR,
        forwardPreviewErrors: "exceptions-only",
      })) as SlidevRuntimeWebContainer;
      onLog("WebContainer booted.");
      return webcontainer;
    })();
  } else {
    onLog("Reusing existing WebContainer boot.");
  }

  return await bootPromise;
}

async function prepareProject(
  webcontainer: SlidevRuntimeWebContainer,
  source: string,
  onLog: (chunk: string) => void,
): Promise<void> {
  if (installPromise === undefined) {
    onLog(`Mounting Slidev project files (${source.length} slide source characters).`);
    await webcontainer.mount(createSlidevRuntimeProjectTree(source));
    onLog("Slidev project files mounted.");
    return;
  }

  onLog(`Updating slides.md before preview restart (${source.length} characters).`);
  await webcontainer.fs.writeFile("slides.md", source);
  onLog("slides.md updated before preview restart.");
}

async function installRuntime(
  webcontainer: SlidevRuntimeWebContainer,
  options: {
    readonly generation: number;
    readonly onLifecycleLog: (chunk: string) => void;
    readonly onProcessLog: (chunk: string) => void;
  },
): Promise<void> {
  const hasInstallPromise = installPromise !== undefined;

  if (installPromise === undefined) {
    options.onLifecycleLog(
      `Installing pinned Slidev dependencies @slidev/cli@${SLIDEV_CLI_VERSION} and @slidev/theme-default@${SLIDEV_THEME_DEFAULT_VERSION}.`,
    );
    installPromise = (async () => {
      await checkPnpmVersion({
        webcontainer,
        onLifecycleLog: options.onLifecycleLog,
        onProcessLog: options.onProcessLog,
      });
      const install = (await webcontainer.spawn("pnpm", [
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--reporter=append-only",
      ])) as SlidevRuntimeProcess;
      options.onLifecycleLog(
        "Spawned pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only.",
      );
      const stopReading = readProcessOutput(install, options.onProcessLog);
      const stopHeartbeat = startLifecycleHeartbeat({
        label: "pnpm install",
        onLog: options.onLifecycleLog,
        shouldContinue: () => isActiveGeneration(options.generation),
      });
      const exitCode = await install.exit.finally(() => {
        stopHeartbeat();
        stopReading();
      });
      options.onLifecycleLog(`pnpm install exited with code ${exitCode}.`);
      if (exitCode !== 0) {
        throw new SlidevRuntimeProbeError(
          "install-failed",
          `Slidev dependency install exited with code ${exitCode}.`,
        );
      }
    })();
  } else {
    options.onLifecycleLog("Waiting for existing Slidev dependency install.");
  }

  try {
    await installPromise;
    options.onLifecycleLog(
      hasInstallPromise ? "Slidev dependencies already installed." : "Slidev dependencies ready.",
    );
  } catch (error) {
    installPromise = undefined;
    options.onLifecycleLog("Slidev dependency install failed; install cache reset.");
    throw error;
  }
}

async function checkPnpmVersion(options: {
  readonly webcontainer: SlidevRuntimeWebContainer;
  readonly onLifecycleLog: (chunk: string) => void;
  readonly onProcessLog: (chunk: string) => void;
}): Promise<void> {
  options.onLifecycleLog(
    `Checking WebContainer pnpm version for pnpm-lock.yaml v${SLIDEV_PNPM_LOCKFILE_VERSION}.`,
  );
  const versionCheck = (await options.webcontainer.spawn("pnpm", [
    "--version",
  ])) as SlidevRuntimeProcess;
  options.onLifecycleLog("Spawned pnpm --version.");
  const versionOutput = captureProcessOutput(versionCheck, options.onProcessLog);
  const [exitCode, output] = await Promise.all([versionCheck.exit, versionOutput]);
  const version = output.trim();
  if (version.length > 0) {
    options.onLifecycleLog(`WebContainer pnpm version detected: ${version}.`);
  }
  options.onLifecycleLog(`pnpm --version exited with code ${exitCode}.`);

  if (exitCode !== 0) {
    throw new SlidevRuntimeProbeError(
      "install-failed",
      `pnpm --version exited with code ${exitCode}.`,
    );
  }
}

async function startServer(
  webcontainer: SlidevRuntimeWebContainer,
  options: {
    readonly generation: number;
    readonly onLifecycleLog: (chunk: string) => void;
    readonly onProcessLog: (chunk: string) => void;
    readonly readyTimeoutMs: number;
  },
): Promise<string> {
  options.onLifecycleLog(`Waiting for Slidev server-ready on port ${SLIDEV_RUNTIME_PORT}.`);
  const ready = new Promise<string>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      options.onLifecycleLog("Slidev server-ready timed out.");
      reject(
        new SlidevRuntimeProbeError(
          "server-failed",
          "Slidev server did not become ready before the timeout.",
        ),
      );
    }, options.readyTimeoutMs);

    unsubscribeServerReady = webcontainer.on("server-ready", (port, url) => {
      options.onLifecycleLog(`Received server-ready for port ${port}: ${url}`);
      if (port !== SLIDEV_RUNTIME_PORT || !isActiveGeneration(options.generation)) {
        return;
      }

      globalThis.clearTimeout(timeout);
      unsubscribeServerReady?.();
      unsubscribeServerReady = undefined;
      resolve(url);
    });
  });

  options.onLifecycleLog(`Spawning pnpm run dev on port ${SLIDEV_RUNTIME_PORT}.`);
  serverProcess = (await webcontainer.spawn("pnpm", ["run", "dev"])) as SlidevRuntimeProcess;
  readProcessOutput(serverProcess, options.onProcessLog);
  const stopStartupHeartbeat = startLifecycleHeartbeat({
    label: "Slidev dev server startup",
    onLog: options.onLifecycleLog,
    shouldContinue: () => isActiveGeneration(options.generation),
  });
  serverProcess.exit
    .then((exitCode) => {
      options.onLifecycleLog(`Slidev dev server process exited with code ${exitCode}.`);
    })
    .catch((serverError: unknown) => {
      options.onLifecycleLog(
        `Slidev dev server process exit rejected: ${messageFromError(serverError)}`,
      );
    });

  try {
    return await ready;
  } finally {
    stopStartupHeartbeat();
  }
}

function stopServer(onLog?: (chunk: string) => void): void {
  if (unsubscribeServerReady !== undefined) {
    onLog?.("Unsubscribing from pending server-ready listener.");
  }
  unsubscribeServerReady?.();
  unsubscribeServerReady = undefined;

  if (serverProcess !== undefined) {
    onLog?.("Stopping existing Slidev dev server process.");
  }
  serverProcess?.kill();
  serverProcess = undefined;
}

function cleanRuntimeLogLine(source: string, line: string): string | null {
  const cleaned = stripControlCharacters(line.replace(ANSI_ESCAPE_PATTERN, "")).trimEnd();
  const compact = cleaned.trim();

  if (compact.length === 0) {
    return null;
  }

  if (
    (source === "npm" || source === "pnpm" || source === "slidev") &&
    PROCESS_SPINNER_PATTERN.test(compact)
  ) {
    return null;
  }

  return cleaned;
}

function stripControlCharacters(value: string): string {
  let stripped = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code >= 0 && code <= 8) || (code >= 11 && code <= 31) || code === 127) {
      continue;
    }
    stripped += character;
  }
  return stripped;
}

function readProcessOutput(
  process: Pick<SlidevRuntimeProcess, "output">,
  onLog: (chunk: string) => void,
): () => void {
  const reader = process.output.getReader();
  let cancelled = false;

  void (async () => {
    try {
      while (!cancelled) {
        const next = await reader.read();
        if (next.done) break;
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
  onLog: (chunk: string) => void,
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
      onLog(next.value);
    }
  } catch {
  } finally {
    reader.releaseLock();
  }

  return chunks.join("");
}

function startLifecycleHeartbeat(options: {
  readonly label: string;
  readonly onLog: (chunk: string) => void;
  readonly shouldContinue: () => boolean;
}): () => void {
  const startedAt = Date.now();
  let stopped = false;
  const timer = globalThis.setInterval(() => {
    if (!options.shouldContinue()) {
      stop();
      return;
    }

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    options.onLog(`${options.label} still running after ${elapsedSeconds}s.`);
  }, PROCESS_HEARTBEAT_INTERVAL_MS);

  function stop(): void {
    if (stopped) {
      return;
    }

    stopped = true;
    globalThis.clearInterval(timer);
  }

  return stop;
}

function isActiveGeneration(generation: number): boolean {
  return generation === runtimeGeneration;
}

function mapRuntimeError(error: unknown): {
  readonly status: SlidevRuntimeStatus;
  readonly message: string;
} {
  if (error instanceof SlidevRuntimeProbeError) {
    return {
      status: error.reason === "install-failed" ? "error" : statusFromFailure(error.reason),
      message: error.message,
    };
  }

  return { status: "error", message: messageFromError(error) };
}

function statusFromFailure(reason: SlidevRuntimeFailureReason): SlidevRuntimeStatus {
  return reason === "headers-missing" ||
    reason === "shared-array-buffer-missing" ||
    reason === "insecure-context" ||
    reason === "unsupported-browser" ||
    reason === "not-browser"
    ? "unsupported"
    : "error";
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
