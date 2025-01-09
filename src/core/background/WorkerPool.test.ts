import { describe, expect, it } from "vitest";

import {
  WorkerPool,
  WorkerPoolAbortedError,
  WorkerPoolDisposedError,
  type WorkerSlot,
} from "~/core/background/WorkerPool";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

interface RunRequest {
  input: number;
  signal: AbortSignal;
  deferred: Deferred<string>;
}

interface FakeSlot extends WorkerSlot<number, string> {
  readonly requests: RunRequest[];
  terminated: boolean;
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

function createHarness(size = 2) {
  const slots: FakeSlot[] = [];
  const pool = new WorkerPool<number, string>({
    size,
    createWorker(id) {
      const slot: FakeSlot = {
        id,
        requests: [],
        terminated: false,
        run(input, signal) {
          const request = { input, signal, deferred: deferred<string>() };
          slot.requests.push(request);

          signal.addEventListener("abort", () => request.deferred.reject(signal.reason), {
            once: true,
          });

          return request.deferred.promise;
        },
        terminate() {
          slot.terminated = true;
        },
      };

      slots.push(slot);

      return slot;
    },
  });

  return { pool, slots };
}

async function flush(): Promise<void> {
  await Promise.resolve();
}

describe("WorkerPool", () => {
  it("creates slots lazily on first run", async () => {
    const { pool, slots } = createHarness();

    expect(slots).toHaveLength(0);

    const run = pool.run(1);
    await flush();

    expect(slots).toHaveLength(1);
    expect(slots[0]?.requests[0]?.input).toBe(1);

    slots[0]?.requests[0]?.deferred.resolve("one");
    await expect(run).resolves.toBe("one");
  });

  it("reuses an idle slot before creating another", async () => {
    const { pool, slots } = createHarness();

    const first = pool.run(1);
    await flush();
    slots[0]?.requests[0]?.deferred.resolve("first");
    await first;

    const second = pool.run(2);
    await flush();

    expect(slots).toHaveLength(1);
    expect(slots[0]?.requests[1]?.input).toBe(2);

    slots[0]?.requests[1]?.deferred.resolve("second");
    await expect(second).resolves.toBe("second");
  });

  it("runs up to capacity and queues additional work", async () => {
    const { pool, slots } = createHarness(2);

    const first = pool.run(1);
    const second = pool.run(2);
    const third = pool.run(3);
    await flush();

    expect(slots).toHaveLength(2);
    expect(pool.activeCount).toBe(2);
    expect(pool.pendingCount).toBe(1);

    slots[0]?.requests[0]?.deferred.resolve("first");
    await expect(first).resolves.toBe("first");
    await flush();

    expect(pool.pendingCount).toBe(0);
    expect(slots.flatMap((slot) => slot.requests.map((request) => request.input))).toContain(3);

    slots[1]?.requests[0]?.deferred.resolve("second");
    const thirdRequest = slots
      .flatMap((slot) => slot.requests)
      .find((request) => request.input === 3);
    thirdRequest?.deferred.resolve("third");

    await expect(second).resolves.toBe("second");
    await expect(third).resolves.toBe("third");
  });

  it("external abort removes a queued run before it starts", async () => {
    const { pool, slots } = createHarness(1);
    const controller = new AbortController();

    const active = pool.run(1);
    const queued = pool.run(2, { signal: controller.signal });
    await flush();

    controller.abort("not-needed");

    await expect(queued).rejects.toBeInstanceOf(WorkerPoolAbortedError);
    expect(pool.pendingCount).toBe(0);

    slots[0]?.requests[0]?.deferred.resolve("active");
    await expect(active).resolves.toBe("active");
  });

  it("dispose rejects queued and active work and terminates slots", async () => {
    const { pool, slots } = createHarness(1);

    const active = pool.run(1);
    const queued = pool.run(2);
    await flush();

    pool.dispose();

    await expect(active).rejects.toBeInstanceOf(WorkerPoolDisposedError);
    await expect(queued).rejects.toBeInstanceOf(WorkerPoolDisposedError);
    expect(slots[0]?.terminated).toBe(true);
    expect(pool.isDisposed).toBe(true);
  });
});
