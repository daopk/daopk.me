export interface KernelIdleScheduler {
  schedule(cb: () => void): () => void;
  cancelPending(): void;
}

export function createKernelIdleScheduler(): KernelIdleScheduler {
  const pendingCancellers = new Set<() => void>();

  function schedule(cb: () => void): () => void {
    let fired = false;
    let cancelled = false;

    const supportsIdleApi =
      typeof globalThis !== "undefined" &&
      typeof (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback === "function";

    let handle: number;

    function run(): void {
      if (cancelled || fired) {
        return;
      }
      fired = true;
      pendingCancellers.delete(canceller);
      cb();
    }

    function canceller(): void {
      if (fired || cancelled) {
        return;
      }
      cancelled = true;
      pendingCancellers.delete(canceller);
      if (supportsIdleApi) {
        (globalThis as unknown as { cancelIdleCallback: (h: number) => void }).cancelIdleCallback(
          handle,
        );
      } else {
        clearTimeout(handle);
      }
    }

    pendingCancellers.add(canceller);

    if (supportsIdleApi) {
      handle = (
        globalThis as unknown as { requestIdleCallback: (cb: () => void) => number }
      ).requestIdleCallback(run);
    } else {
      handle = setTimeout(run, 1) as unknown as number;
    }

    return canceller;
  }

  function cancelPending(): void {
    const snapshot = Array.from(pendingCancellers);
    pendingCancellers.clear();
    for (const cancel of snapshot) {
      cancel();
    }
  }

  return { cancelPending, schedule };
}
