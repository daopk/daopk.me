import { storeToRefs } from "pinia";
import { onScopeDispose, ref, type Ref } from "vue";

import { useKernel } from "~/composables/useKernel";
import {
  useSpotlightRecentsStore,
  type SpotlightRecentEntry,
} from "~/core/spotlight/SpotlightRecentsStore";
import { detectVfsFileType, vfsFileTypeInputFromPath } from "~/core/vfs/fileTypes";
import { dirname, normalizeVfsPath } from "~/core/vfs/path";
import type { SearchHit, SearchKind } from "~/types/search";

const QUERY_DEBOUNCE_MS = 80;
const SPOTLIGHT_SEARCH_OPTIONS = {
  limit: 20,
  include: ["app", "vfs", "command"],
  perKindLimit: { app: 6, vfs: 8, command: 6 },
} as const;

export interface UseSpotlightBindings {
  open: Ref<boolean>;
  query: Ref<string>;
  hits: Ref<readonly SearchHit[]>;
  pending: Ref<boolean>;
  recents: Ref<readonly SpotlightRecentEntry[]>;
  openSpotlight: () => void;
  closeSpotlight: () => void;
  toggle: () => void;
  setQuery: (value: string) => void;
  dispatch: (kind: SearchKind, id: string) => Promise<void>;
}

export function useSpotlight(): UseSpotlightBindings {
  const kernel = useKernel();
  const recentsStore = useSpotlightRecentsStore();

  const open = ref(false);
  const query = ref("");
  const hits = ref<readonly SearchHit[]>([]);
  const pending = ref(false);

  const { entries: recents } = storeToRefs(recentsStore);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let runId = 0;

  function ensureRecentsHydrated(): void {
    // Source-of-truth lives in the store itself so a Pinia teardown
    // (HMR, test reset) reliably triggers a fresh hydrate on the next
    if (recentsStore.isHydrated()) return;
    recentsStore.hydrate();
  }

  function clearDebounce(): void {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
  }

  async function runSearch(text: string): Promise<void> {
    const myRun = ++runId;
    pending.value = true;
    try {
      const results = await kernel.search.query(text, SPOTLIGHT_SEARCH_OPTIONS);
      if (myRun !== runId) return;
      hits.value = results;
    } finally {
      if (myRun === runId) pending.value = false;
    }
  }

  function setQuery(value: string): void {
    query.value = value;
    clearDebounce();
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      runId++;
      hits.value = [];
      pending.value = false;
      return;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void runSearch(value);
    }, QUERY_DEBOUNCE_MS);
  }

  function openSpotlight(): void {
    if (open.value) return;
    ensureRecentsHydrated();
    query.value = "";
    hits.value = [];
    pending.value = false;
    open.value = true;
  }

  function closeSpotlight(): void {
    if (!open.value) return;
    clearDebounce();
    runId++;
    open.value = false;
    query.value = "";
    hits.value = [];
    pending.value = false;
  }

  function toggle(): void {
    if (open.value) {
      closeSpotlight();
    } else {
      openSpotlight();
    }
  }

  async function dispatch(kind: SearchKind, id: string): Promise<void> {
    const vfsMetadata =
      kind === "vfs"
        ? hits.value.find((candidate) => candidate.kind === "vfs" && candidate.id === id)?.vfs
        : undefined;

    if (kind === "command" || kind === "app") {
      recentsStore.push(kind, id);
    }
    closeSpotlight();
    if (kind === "command") {
      await kernel.commands.dispatch(id);
    } else if (kind === "app") {
      kernel.events.emit("app.launch.requested", { manifestId: id, source: "spotlight" });
    } else {
      dispatchVfs(id, vfsMetadata);
    }
  }

  function dispatchVfs(id: string, metadata: SearchHit["vfs"]): void {
    const path = normalizeVfsPath(metadata?.path ?? id);
    if (
      metadata?.entryKind === "file" &&
      detectVfsFileType(vfsFileTypeInputFromPath(path, metadata.mimeType)) === "pdf"
    ) {
      kernel.events.emit("app.launch.requested", {
        manifestId: "pdf-viewer",
        source: "spotlight",
        args: { path },
      });
      return;
    }

    const args =
      metadata?.entryKind === "directory" ? { path } : { path: dirname(path), reveal: path };

    kernel.events.emit("app.launch.requested", {
      manifestId: "finder",
      source: "spotlight",
      args,
    });
    kernel.events.emit("finder.reveal.requested", {
      path: args.path,
      ...(args.reveal === undefined ? {} : { reveal: args.reveal }),
      source: "spotlight",
    });
  }

  onScopeDispose(() => {
    clearDebounce();
    runId++;
  });

  return {
    open,
    query,
    hits,
    pending,
    recents,
    openSpotlight,
    closeSpotlight,
    toggle,
    setQuery,
    dispatch,
  };
}
