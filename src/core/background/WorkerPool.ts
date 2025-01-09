export interface WorkerSlot<Input = unknown, Output = unknown> {
  readonly id: string;
  run(input: Input, signal: AbortSignal): Promise<Output>;
  terminate(): void;
}

export interface WorkerPoolOptions<Input, Output> {
  size?: number;
  createWorker(slotId: string): WorkerSlot<Input, Output>;
}

export interface WorkerPoolRunOptions {
  signal?: AbortSignal;
}

interface SlotRecord<Input, Output> {
  slot: WorkerSlot<Input, Output>;
  busy: boolean;
  terminated: boolean;
}

interface PendingRun<Input, Output> {
  input: Input;
  controller: AbortController;
  resolve(result: Output): void;
  reject(reason: unknown): void;
  onAbort(): void;
  cleanup(): void;
}

export class WorkerPoolDisposedError extends Error {
  readonly code = "worker-pool-disposed" as const;

  constructor() {
    super("WorkerPool has been disposed.");
    this.name = "WorkerPoolDisposedError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WorkerPoolAbortedError extends Error {
  readonly code = "worker-pool-aborted" as const;

  readonly reason: unknown;

  constructor(reason?: unknown) {
    super("WorkerPool run was aborted.");
    this.name = "WorkerPoolAbortedError";
    this.reason = reason;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WorkerPool<Input = unknown, Output = unknown> {
  private readonly maxSize: number;

  private readonly createWorker: (slotId: string) => WorkerSlot<Input, Output>;

  private readonly slots: Array<SlotRecord<Input, Output>> = [];

  private readonly pending: Array<PendingRun<Input, Output>> = [];

  private readonly activeControllers = new Set<AbortController>();

  private disposed = false;

  private nextSlotId = 0;

  constructor(options: WorkerPoolOptions<Input, Output>) {
    const size = options.size ?? navigator.hardwareConcurrency ?? 1;

    if (!Number.isInteger(size) || size < 1) {
      throw new RangeError("WorkerPool size must be a positive integer.");
    }

    this.maxSize = size;
    this.createWorker = options.createWorker;
  }

  get capacity(): number {
    return this.maxSize;
  }

  get activeCount(): number {
    return this.slots.filter((record) => record.busy).length;
  }

  get idleCount(): number {
    return this.slots.filter((record) => !record.busy).length;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  run(input: Input, options: WorkerPoolRunOptions = {}): Promise<Output> {
    if (this.disposed) {
      return Promise.reject(new WorkerPoolDisposedError());
    }

    if (options.signal?.aborted) {
      return Promise.reject(new WorkerPoolAbortedError(options.signal.reason));
    }

    const controller = new AbortController();
    return new Promise<Output>((resolve, reject) => {
      const cleanupExternal = linkAbort(options.signal, controller);
      const pendingRun: PendingRun<Input, Output> = {
        input,
        controller,
        resolve,
        reject,
        onAbort: () => {
          const index = this.pending.indexOf(pendingRun);

          if (index < 0) {
            return;
          }

          this.pending.splice(index, 1);
          pendingRun.cleanup();
          reject(new WorkerPoolAbortedError(controller.signal.reason));
        },
        cleanup: () => {
          cleanupExternal();
          controller.signal.removeEventListener("abort", pendingRun.onAbort);
        },
      };

      controller.signal.addEventListener("abort", pendingRun.onAbort, { once: true });
      this.pending.push(pendingRun);
      this.pump();
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const disposedError = new WorkerPoolDisposedError();

    for (const pendingRun of this.pending.splice(0)) {
      pendingRun.cleanup();
      pendingRun.controller.abort(disposedError);
      pendingRun.reject(disposedError);
    }

    for (const controller of this.activeControllers) {
      if (!controller.signal.aborted) {
        controller.abort(disposedError);
      }
    }

    for (const record of this.slots.splice(0)) {
      terminateRecord(record);
    }
  }

  private pump(): void {
    if (this.disposed) {
      return;
    }

    while (this.pending.length > 0) {
      const record = this.claimSlot();

      if (!record) {
        return;
      }

      const pendingRun = this.pending.shift();

      if (!pendingRun) {
        record.busy = false;

        return;
      }

      if (pendingRun.controller.signal.aborted) {
        pendingRun.cleanup();
        pendingRun.reject(new WorkerPoolAbortedError(pendingRun.controller.signal.reason));
        record.busy = false;
        continue;
      }

      void this.execute(record, pendingRun);
    }
  }

  private claimSlot(): SlotRecord<Input, Output> | null {
    const idle = this.slots.find((record) => !record.busy && !record.terminated);

    if (idle) {
      idle.busy = true;

      return idle;
    }

    if (this.slots.length >= this.maxSize) {
      return null;
    }

    const slotId = `worker-${++this.nextSlotId}`;
    const record: SlotRecord<Input, Output> = {
      slot: this.createWorker(slotId),
      busy: true,
      terminated: false,
    };

    this.slots.push(record);

    return record;
  }

  private async execute(record: SlotRecord<Input, Output>, pendingRun: PendingRun<Input, Output>) {
    const { controller } = pendingRun;
    this.activeControllers.add(controller);

    try {
      const result = await rejectOnAbort(
        record.slot.run(pendingRun.input, controller.signal),
        controller.signal,
      );
      pendingRun.resolve(result);
    } catch (error) {
      pendingRun.reject(error);
    } finally {
      pendingRun.cleanup();
      this.activeControllers.delete(controller);

      if (this.disposed || record.terminated) {
        terminateRecord(record);
      } else {
        record.busy = false;
        this.pump();
      }
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

function rejectOnAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(
      signal.reason instanceof Error ? signal.reason : new WorkerPoolAbortedError(signal.reason),
    );
  }

  return new Promise<T>((resolve, reject) => {
    const abort = () =>
      reject(
        signal.reason instanceof Error ? signal.reason : new WorkerPoolAbortedError(signal.reason),
      );

    signal.addEventListener("abort", abort, { once: true });

    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function terminateRecord<Input, Output>(record: SlotRecord<Input, Output>): void {
  if (record.terminated) {
    return;
  }

  record.terminated = true;
  record.busy = false;
  record.slot.terminate();
}
