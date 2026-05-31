import { computed, onMounted, onUnmounted, ref } from "vue";

import { debugWarn } from "~/core/debug";
import { photosIndexUrl } from "~/core/photos/photosContentConfig";

export type PhotosStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface Photo {
  readonly key: string;
  readonly url: string;
  readonly size: number;
  readonly uploaded: string | null;
  readonly contentType: string;
}

export interface UsePhotosOptions {
  /** Override the index loader (defaults to fetching the Worker `/photos/index.json`). */
  readonly fetchIndex?: () => Promise<readonly Photo[]>;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function photoFromEntry(entry: unknown): Photo | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const key = asNonEmptyString(record.key);
  if (key === null) {
    return null;
  }

  const size =
    typeof record.size === "number" && Number.isFinite(record.size) ? record.size : 0;

  return {
    key,
    url: asNonEmptyString(record.url) ?? `/photos/${key}`,
    size,
    uploaded: asNonEmptyString(record.uploaded),
    contentType: asNonEmptyString(record.contentType) ?? "application/octet-stream",
  };
}

/** Fetch + parse the gallery index served same-origin by the Worker. */
export async function fetchPhotosIndex(): Promise<readonly Photo[]> {
  const response = await fetch(photosIndexUrl(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Failed to load photos index (${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.map(photoFromEntry).filter((photo): photo is Photo => photo !== null);
}

export function usePhotos(options: UsePhotosOptions = {}) {
  const loadIndex = options.fetchIndex ?? fetchPhotosIndex;

  const photos = ref<readonly Photo[]>([]);
  const status = ref<PhotosStatus>("idle");

  const loading = computed(() => status.value === "loading");
  const empty = computed(() => status.value === "empty");
  const loadFailed = computed(() => status.value === "error");

  let disposed = false;
  let refreshRun = 0;

  async function refresh(): Promise<void> {
    const run = ++refreshRun;
    status.value = "loading";

    try {
      const next = await loadIndex();
      if (disposed || run !== refreshRun) {
        return;
      }

      photos.value = next;
      status.value = next.length === 0 ? "empty" : "ready";
    } catch (error) {
      if (disposed || run !== refreshRun) {
        return;
      }

      debugWarn("[photos] failed to load gallery index", error);
      status.value = "error";
    }
  }

  function dispose(): void {
    disposed = true;
    refreshRun += 1;
  }

  onMounted(() => {
    void refresh();
  });

  onUnmounted(() => {
    dispose();
  });

  return {
    photos,
    status,
    loading,
    empty,
    loadFailed,
    refresh,
    dispose,
  };
}
