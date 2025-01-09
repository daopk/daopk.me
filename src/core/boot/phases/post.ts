import { debugWarn } from "~/core/debug";

import type { BootPhase } from "~/core/boot/types";

const POST_WATCHDOG_MS = 1500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function throwIf(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

async function waitFonts(signal: AbortSignal): Promise<void> {
  throwIf(signal);
  try {
    if (globalThis.document?.fonts?.ready) {
      await globalThis.document.fonts.ready;
    }
  } catch {}
}

async function doubleRaf(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function probeCrypto(): void {
  try {
    globalThis.crypto?.randomUUID?.();
  } catch {}
}

function sniffServiceWorker(): void {
  void ("serviceWorker" in navigator);
}

function peekIndexedDb(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const rq = indexedDB.open("daopk-post-capability");
      const done = (): void => {
        try {
          rq.result.close();
        } catch {}
        resolve();
      };

      rq.onerror = (): void => {
        resolve();
      };
      rq.onsuccess = done;
      rq.onupgradeneeded = (): void => {
        rq.transaction?.abort();
      };

      window.setTimeout(done, 300);
    } catch {
      resolve();
    }
  });
}

async function milestones(signal: AbortSignal): Promise<void> {
  throwIf(signal);
  probeCrypto();
  sniffServiceWorker();

  await Promise.all([waitFonts(signal), doubleRaf(signal), peekIndexedDb()]);
}

/** Never rejects with AbortError — maps cancellation to `{ aborted: true }` for clean races/HMR dispose. */
async function milestonesQuiet(signal: AbortSignal): Promise<{ aborted: boolean }> {
  try {
    await milestones(signal);
    return { aborted: false };
  } catch (error: unknown) {
    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      return { aborted: true };
    }

    throw error;
  }
}

type PostRaceOutcome = { source: "milestones"; aborted: boolean } | { source: "watchdog" };

export const postPhase: BootPhase = {
  id: "post",
  label: "POST",
  weight: 20,
  async run(ctx) {
    const { signal } = ctx;

    const winner = await Promise.race<PostRaceOutcome>([
      milestonesQuiet(signal).then(
        (result): PostRaceOutcome => ({
          source: "milestones",
          aborted: result.aborted,
        }),
      ),
      delay(POST_WATCHDOG_MS).then(
        (): PostRaceOutcome => ({
          source: "watchdog",
        }),
      ),
    ]);

    if (winner.source === "watchdog") {
      debugWarn("[boot]", "POST watchdog — continuing after stalled milestone");
      void milestonesQuiet(signal);
    }
  },
};
