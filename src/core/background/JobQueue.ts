export type JobPriority = "user-critical" | "interactive" | "background";

export interface JobOptions {
  priority?: JobPriority;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export interface JobHandle<T> {
  readonly id: string;
  readonly promise: Promise<T>;
  abort(reason?: unknown): void;
}

export interface JobQueueOptions {
  concurrency?: number;
}

export type JobRunner<T> = (signal: AbortSignal, attempt: number) => Promise<T> | T;

interface QueuedJob<T> {
  id: string;
  sequence: number;
  priority: JobPriority;
  retries: number;
  timeoutMs?: number;
  externalSignal?: AbortSignal;
  rootController: AbortController;
  runner: JobRunner<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
  cleanupExternal(): void;
}

const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  "user-critical": 3,
  interactive: 2,
  background: 1,
};

export class JobAbortedError extends Error {
  readonly code: "job-aborted" | "job-queue-disposed" = "job-aborted";

  readonly jobId: string;

  readonly reason: unknown;

  constructor(jobId: string, reason?: unknown) {
    super(`Job aborted: ${jobId}`);
    this.name = "JobAbortedError";
    this.jobId = jobId;
    this.reason = reason;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class JobQueueDisposedError extends JobAbortedError {
  readonly code = "job-queue-disposed" as const;

  constructor(jobId: string) {
    super(jobId, "queue-disposed");
    this.name = "JobQueueDisposedError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class JobTimeoutError extends Error {
  readonly code = "job-timeout" as const;

  readonly jobId: string;

  readonly timeoutMs: number;

  readonly attempt: number;

  constructor(jobId: string, timeoutMs: number, attempt: number) {
    super(`Job timed out after ${timeoutMs}ms: ${jobId}`);
    this.name = "JobTimeoutError";
    this.jobId = jobId;
    this.timeoutMs = timeoutMs;
    this.attempt = attempt;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class JobQueue {
  private readonly concurrency: number;

  private readonly queued: Array<QueuedJob<unknown>> = [];

  private readonly active = new Set<QueuedJob<unknown>>();

  private disposed = false;

  private nextId = 0;

  private nextSequence = 0;

  constructor(options: JobQueueOptions = {}) {
    const concurrency = options.concurrency ?? 1;

    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError("JobQueue concurrency must be a positive integer.");
    }

    this.concurrency = concurrency;
  }

  get pendingCount(): number {
    return this.queued.length;
  }

  get activeCount(): number {
    return this.active.size;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  enqueue<T>(runner: JobRunner<T>, options: JobOptions = {}): JobHandle<T> {
    const id = `job-${++this.nextId}`;

    if (this.disposed) {
      const error = new JobQueueDisposedError(id);

      return {
        id,
        promise: Promise.reject(error),
        abort: () => {},
      };
    }

    const rootController = new AbortController();

    if (options.signal?.aborted) {
      rootController.abort(options.signal.reason);
    }

    const cleanupExternal = linkAbort(options.signal, rootController);

    let rejectJob: (reason: unknown) => void = () => {};

    const promise = new Promise<T>((resolve, reject) => {
      rejectJob = reject;

      const job: QueuedJob<T> = {
        id,
        sequence: ++this.nextSequence,
        priority: options.priority ?? "interactive",
        retries: options.retries ?? 0,
        timeoutMs: options.timeoutMs,
        externalSignal: options.signal,
        rootController,
        runner,
        resolve,
        reject,
        cleanupExternal,
      };

      if (rootController.signal.aborted) {
        cleanupExternal();
        reject(new JobAbortedError(id, rootController.signal.reason));

        return;
      }

      this.queued.push(job as QueuedJob<unknown>);
      this.pump();
    });

    return {
      id,
      promise,
      abort: (reason?: unknown) => {
        if (!rootController.signal.aborted) {
          rootController.abort(reason);
        }

        if (this.removeQueued(id)) {
          cleanupExternal();
          rejectJob(new JobAbortedError(id, reason));
        }
      },
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const job of this.queued.splice(0)) {
      job.cleanupExternal();
      job.rootController.abort("queue-disposed");
      job.reject(new JobQueueDisposedError(job.id));
    }

    for (const job of this.active) {
      if (!job.rootController.signal.aborted) {
        job.rootController.abort("queue-disposed");
      }
    }
  }

  private pump(): void {
    while (!this.disposed && this.active.size < this.concurrency && this.queued.length > 0) {
      const next = this.takeNextJob();

      if (!next) {
        return;
      }

      this.active.add(next);
      void this.runJob(next);
    }
  }

  private takeNextJob(): QueuedJob<unknown> | undefined {
    let bestIndex = 0;

    for (let index = 1; index < this.queued.length; index += 1) {
      const current = this.queued[index]!;
      const best = this.queued[bestIndex]!;
      const currentWeight = PRIORITY_WEIGHT[current.priority];
      const bestWeight = PRIORITY_WEIGHT[best.priority];

      if (
        currentWeight > bestWeight ||
        (currentWeight === bestWeight && current.sequence < best.sequence)
      ) {
        bestIndex = index;
      }
    }

    return this.queued.splice(bestIndex, 1)[0];
  }

  private async runJob(job: QueuedJob<unknown>): Promise<void> {
    try {
      const result = await this.runWithRetries(job);
      job.resolve(result);
    } catch (error) {
      if (
        error instanceof JobAbortedError &&
        job.rootController.signal.reason === "queue-disposed"
      ) {
        job.reject(new JobQueueDisposedError(job.id));
      } else {
        job.reject(error);
      }
    } finally {
      job.cleanupExternal();
      this.active.delete(job);
      this.pump();
    }
  }

  private async runWithRetries(job: QueuedJob<unknown>): Promise<unknown> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= job.retries) {
      attempt += 1;

      if (job.rootController.signal.aborted) {
        throw new JobAbortedError(job.id, job.rootController.signal.reason);
      }

      try {
        return await runAttempt(job, attempt);
      } catch (error) {
        lastError = error;

        if (error instanceof JobAbortedError) {
          throw error;
        }

        if (attempt > job.retries) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private removeQueued(id: string): boolean {
    const index = this.queued.findIndex((job) => job.id === id);

    if (index < 0) {
      return false;
    }

    this.queued.splice(index, 1);

    return true;
  }
}

async function runAttempt(job: QueuedJob<unknown>, attempt: number): Promise<unknown> {
  const attemptController = new AbortController();
  const cleanupRoot = linkAbort(job.rootController.signal, attemptController);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (job.timeoutMs !== undefined) {
    timeoutId = setTimeout(() => {
      attemptController.abort(new JobTimeoutError(job.id, job.timeoutMs!, attempt));
    }, job.timeoutMs);
  }

  try {
    const result = Promise.resolve(job.runner(attemptController.signal, attempt));

    return await rejectOnAbort(result, attemptController.signal, job.id);
  } finally {
    cleanupRoot();

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function linkAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) {
    return () => {};
  }

  const abort = () => {
    if (!target.signal.aborted) {
      target.abort(source.reason);
    }
  };

  source.addEventListener("abort", abort, { once: true });

  return () => source.removeEventListener("abort", abort);
}

function rejectOnAbort<T>(promise: Promise<T>, signal: AbortSignal, jobId: string): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(toAbortError(jobId, signal.reason));
  }

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(toAbortError(jobId, signal.reason));

    signal.addEventListener("abort", abort, { once: true });

    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function toAbortError(jobId: string, reason: unknown): Error {
  if (reason instanceof JobTimeoutError) {
    return reason;
  }

  return new JobAbortedError(jobId, reason);
}
