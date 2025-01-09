import { debugWarn } from "~/core/debug";

import type { Kernel } from "~/types/kernel";

let latched = false;
let currentRunToken: symbol | null = null;

export async function runAutorunManifests(kernel: Kernel): Promise<void> {
  if (latched) {
    return;
  }

  latched = true;

  const runToken = Symbol("autorun-run");
  currentRunToken = runToken;

  const manifests = kernel.apps.list().filter((m): boolean => m.autorun === true);

  for (const manifest of manifests) {
    if (currentRunToken !== runToken) {
      return;
    }

    if (manifest.singleton !== true) {
      debugWarn(
        "[autorun]",
        `skipping ${manifest.id} — autorun requires singleton:true to avoid spawning duplicates after a manual launch`,
      );
      continue;
    }

    try {
      await kernel.apps.launch(manifest.id);
    } catch (err: unknown) {
      debugWarn("[autorun]", `launch failed for ${manifest.id}`, err);
    }
  }

  if (currentRunToken === runToken) {
    currentRunToken = null;
  }
}

export function resetAutorunLatch(): void {
  latched = false;
  currentRunToken = null;
}
