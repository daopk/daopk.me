import { describe, expect, it } from "vitest";

import { createProfileCoordination } from "~/core/profile/ProfileCoordination";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("ProfileCoordination", () => {
  it("shares a FIFO same-realm fallback across adapter instances", async () => {
    const firstCoordination = createProfileCoordination();
    const secondCoordination = createProfileCoordination();
    const releaseFirst = deferred();
    const events: string[] = [];

    const first = firstCoordination.runExclusive(async () => {
      events.push("first:start");
      await releaseFirst.promise;
      events.push("first:end");
    });
    await Promise.resolve();

    const second = secondCoordination.runExclusive(() => {
      events.push("second");
    });
    await Promise.resolve();

    expect(events).toEqual(["first:start"]);

    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("uses an exclusive Web Lock when the browser provides it", async () => {
    const originalLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    const requests: Array<{ name: string; mode: LockMode | undefined }> = [];
    const request = async <T>(
      name: string,
      options: LockOptions,
      callback: LockGrantedCallback<T>,
    ): Promise<T> => {
      requests.push({ name, mode: options.mode });
      return await callback(null);
    };

    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });

    try {
      const result = await createProfileCoordination().runExclusive(() => "done");

      expect(result).toBe("done");
      expect(requests).toEqual([{ name: "daopk:profiles:lifecycle", mode: "exclusive" }]);
    } finally {
      if (originalLocksDescriptor === undefined) {
        Reflect.deleteProperty(navigator, "locks");
      } else {
        Object.defineProperty(navigator, "locks", originalLocksDescriptor);
      }
    }
  });
});
