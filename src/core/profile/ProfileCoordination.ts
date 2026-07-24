const PROFILE_LIFECYCLE_LOCK_NAME = "daopk:profiles:lifecycle";

export type ProfileExclusiveOperation<T> = () => T | Promise<T>;

/**
 * Internal seam for serializing profile-index lifecycle mutations.
 *
 * Production uses the browser's origin-wide Web Locks implementation when it
 * is available. Tests can inject a deterministic adapter through ProfileStore.
 */
export interface ProfileCoordination {
  runExclusive<T>(operation: ProfileExclusiveOperation<T>): Promise<T>;
}

interface SameRealmQueue {
  pending: number;
  tail: Promise<void>;
}

const sameRealmQueues = new Map<string, SameRealmQueue>();

function availableLockManager(): LockManager | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const manager = navigator.locks;
  return typeof manager?.request === "function" ? manager : null;
}

function runSameRealmExclusive<T>(
  name: string,
  operation: ProfileExclusiveOperation<T>,
): Promise<T> {
  let queue = sameRealmQueues.get(name);
  if (!queue) {
    queue = {
      pending: 0,
      tail: Promise.resolve(),
    };
    sameRealmQueues.set(name, queue);
  }

  const waitForTurn = queue.tail.catch(() => undefined);
  let releaseTurn!: () => void;
  const currentTurn = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });

  queue.pending += 1;
  queue.tail = waitForTurn.then(() => currentTurn);

  return waitForTurn.then(operation).finally(() => {
    releaseTurn();
    queue.pending -= 1;
    if (queue.pending === 0 && sameRealmQueues.get(name) === queue) {
      sameRealmQueues.delete(name);
    }
  });
}

export function createProfileCoordination(): ProfileCoordination {
  return {
    runExclusive<T>(operation: ProfileExclusiveOperation<T>): Promise<T> {
      const lockManager = availableLockManager();
      if (lockManager) {
        return lockManager.request(
          PROFILE_LIFECYCLE_LOCK_NAME,
          { mode: "exclusive" },
          async () => await operation(),
        );
      }

      return runSameRealmExclusive(PROFILE_LIFECYCLE_LOCK_NAME, operation);
    },
  };
}
