import { debugWarn } from "~/core/debug";

export async function getCache(name: string): Promise<Cache | null> {
  if (typeof caches === "undefined" || !("caches" in globalThis.self)) {
    debugWarn("[getCache]", "CacheStorage unavailable");

    return null;
  }

  try {
    return await caches.open(name);
  } catch (error: unknown) {
    debugWarn("[getCache]", "open failed", name, error);
    return null;
  }
}
