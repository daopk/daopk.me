import { describe, expect, it, vi } from "vitest";

import {
  JobAbortedError,
  JobQueue,
  JobQueueDisposedError,
  JobTimeoutError,
} from "~/core/background/JobQueue";
import { WorkerPool } from "~/core/background/WorkerPool";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await Promise.resolve();
}

describe("JobQueue", () => {
  it("runs higher-priority queued jobs before lower-priority queued jobs", async () => {
    const queue = new JobQueue({ concurrency: 1 });
    const blocker = deferred<string>();
    const started: string[] = [];

    const first = queue.enqueue(async () => {
      started.push("first");

      return blocker.promise;
    });
    const background = queue.enqueue(
      async () => {
        started.push("background");

        return "background";
      },
      { priority: "background" },
    );
    const urgent = queue.enqueue(
      async () => {
        started.push("urgent");

        return "urgent";
      },
      { priority: "user-critical" },
    );

    await flush();
    expect(started).toEqual(["first"]);

    blocker.resolve("first");
    await expect(first.promise).resolves.toBe("first");
    await expect(urgent.promise).resolves.toBe("urgent");
    await expect(background.promise).resolves.toBe("background");
    expect(started).toEqual(["first", "urgent", "background"]);
  });

  it("keeps same-priority jobs FIFO", async () => {
    const queue = new JobQueue({ concurrency: 1 });
    const blocker = deferred<string>();
    const started: string[] = [];

    const first = queue.enqueue(async () => {
      started.push("first");

      return blocker.promise;
    });
    const second = queue.enqueue(async () => {
      started.push("second");

      return "second";
    });
    const third = queue.enqueue(async () => {
      started.push("third");

      return "third";
    });

    await flush();
    blocker.resolve("first");

    await expect(first.promise).resolves.toBe("first");
    await expect(second.promise).resolves.toBe("second");
    await expect(third.promise).resolves.toBe("third");
    expect(started).toEqual(["first", "second", "third"]);
  });

  it("honors the configured concurrency limit", async () => {
    const queue = new JobQueue({ concurrency: 2 });
    const first = deferred<string>();
    const second = deferred<string>();
    const started: string[] = [];

    const one = queue.enqueue(async () => {
      started.push("one");

      return first.promise;
    });
    const two = queue.enqueue(async () => {
      started.push("two");

      return second.promise;
    });
    const three = queue.enqueue(async () => {
      started.push("three");

      return "three";
    });

    await flush();
    expect(started).toEqual(["one", "two"]);
    expect(queue.pendingCount).toBe(1);

    first.resolve("one");
    await expect(one.promise).resolves.toBe("one");
    await expect(three.promise).resolves.toBe("three");

    second.resolve("two");
    await expect(two.promise).resolves.toBe("two");
  });

  it("rejects with JobTimeoutError when an attempt exceeds timeoutMs", async () => {
    vi.useFakeTimers();
    const queue = new JobQueue();
    const handle = queue.enqueue(() => new Promise<string>(() => {}), { timeoutMs: 10 });
    const assertion = expect(handle.promise).rejects.toBeInstanceOf(JobTimeoutError);

    await vi.advanceTimersByTimeAsync(10);

    await assertion;
    vi.useRealTimers();
  });

  it("retries failures and resolves on a later attempt", async () => {
    const queue = new JobQueue();
    const attempts: number[] = [];

    const handle = queue.enqueue(
      (_signal, attempt) => {
        attempts.push(attempt);

        if (attempt < 3) {
          throw new Error("try again");
        }

        return "ok";
      },
      { retries: 2 },
    );

    await expect(handle.promise).resolves.toBe("ok");
    expect(attempts).toEqual([1, 2, 3]);
  });

  it("handle.abort cancels a queued job before it starts", async () => {
    const queue = new JobQueue({ concurrency: 1 });
    const blocker = deferred<string>();

    const active = queue.enqueue(() => blocker.promise);
    const queued = queue.enqueue(() => "queued");
    await flush();

    queued.abort("not-needed");

    await expect(queued.promise).rejects.toBeInstanceOf(JobAbortedError);
    expect(queue.pendingCount).toBe(0);

    blocker.resolve("active");
    await expect(active.promise).resolves.toBe("active");
  });

  it("dispose rejects queued and in-flight jobs", async () => {
    const queue = new JobQueue({ concurrency: 1 });

    const active = queue.enqueue(() => new Promise<string>(() => {}));
    const queued = queue.enqueue(() => "queued");
    await flush();

    queue.dispose();

    await expect(active.promise).rejects.toBeInstanceOf(JobQueueDisposedError);
    await expect(queued.promise).rejects.toBeInstanceOf(JobQueueDisposedError);
  });

  it("can schedule synthetic work through WorkerPool", async () => {
    const pool = new WorkerPool<number, number>({
      size: 3,
      createWorker(id) {
        return {
          id,
          async run(input, signal) {
            if (signal.aborted) {
              throw signal.reason;
            }

            await Promise.resolve();

            return input * 2;
          },
          terminate() {},
        };
      },
    });
    const queue = new JobQueue({ concurrency: 10 });

    const handles = Array.from({ length: 10 }, (_, index) =>
      queue.enqueue((signal) => pool.run(index, { signal })),
    );

    await expect(Promise.all(handles.map((handle) => handle.promise))).resolves.toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18,
    ]);

    pool.dispose();
    queue.dispose();
  });
});
