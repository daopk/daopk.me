import { JobQueue, type JobOptions } from "~/core/background/JobQueue";
import { RpcRelay, unwrapRpcEnvelope, type Remote, type RpcEnvelope } from "~/core/ipc/rpc";
import type { MarkdownRenderResult } from "~/core/markdown/MarkdownPipeline";
import type { MarkdownRenderer } from "~/core/markdown/MarkdownRenderer";

export interface MarkdownWorkerApi {
  ready(): Promise<RpcEnvelope<void>>;
  render(source: string): Promise<RpcEnvelope<MarkdownRenderResult>>;
}

export interface MarkdownWorkerClient {
  readonly api: MarkdownWorkerApi | Remote<MarkdownWorkerApi>;
  terminate(): void;
}

export interface MarkdownWorkerAdapterOptions {
  createClient?: () => MarkdownWorkerClient;
  readyTimeoutMs?: number;
  renderTimeoutMs?: number;
}

const DEFAULT_MARKDOWN_WORKER_READY_TIMEOUT_MS = 1_000;
const DEFAULT_MARKDOWN_WORKER_RENDER_TIMEOUT_MS = 3_000;

export function canUseMarkdownWorker(): boolean {
  return typeof Worker !== "undefined";
}

function createDefaultMarkdownWorkerClient(): MarkdownWorkerClient {
  const worker = new Worker(new URL("../../workers/markdown.worker.ts", import.meta.url), {
    name: "daopk-markdown-pipeline",
    type: "module",
  });
  const relay = new RpcRelay();

  return {
    api: relay.wrap<MarkdownWorkerApi>(worker),
    terminate: () => worker.terminate(),
  };
}

export function createMarkdownWorkerRenderer(
  options: MarkdownWorkerAdapterOptions = {},
): MarkdownRenderer {
  const client = (options.createClient ?? createDefaultMarkdownWorkerClient)();
  const queue = new JobQueue({ concurrency: 1 });
  let disposed = false;

  async function callWorker<T>(
    call: () => Promise<RpcEnvelope<T>>,
    jobOptions?: JobOptions,
  ): Promise<T> {
    const handle = queue.enqueue(async () => unwrapRpcEnvelope(await call()), jobOptions);

    return handle.promise;
  }

  const ready = callWorker(() => client.api.ready(), {
    priority: "user-critical",
    timeoutMs: options.readyTimeoutMs ?? DEFAULT_MARKDOWN_WORKER_READY_TIMEOUT_MS,
  });

  void ready.catch(() => undefined);

  return {
    ready,

    render(source): Promise<MarkdownRenderResult> {
      if (disposed) {
        return Promise.resolve({ html: "" });
      }

      return callWorker(() => client.api.render(source), {
        priority: "interactive",
        timeoutMs: options.renderTimeoutMs ?? DEFAULT_MARKDOWN_WORKER_RENDER_TIMEOUT_MS,
      });
    },

    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      queue.dispose();
      client.terminate();
    },
  };
}
