import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";

import { activeProfileKvNamespace, KVStore, type Kernel } from "@daopk/sdk";

const MOVIES_THEME_SUGGESTION_KV_NAMESPACE = "movies";
const MOVIES_THEME_SUGGESTION_KV_KEY = "theme-suggestion";
const DATE_PART_PAD_LENGTH = 2;
const MOBILE_BREAKPOINT_WIDTH = 768;

type MoviesThemeSuggestionShellId = "desktop" | "mobile";

interface MoviesThemeSuggestionState {
  readonly lastPromptDate: string;
}

export interface UseMoviesThemeSuggestionOptions {
  readonly kernel: Pick<Kernel, "events" | "theme"> | null;
  readonly now?: () => Date;
  readonly storageNamespace?: string;
}

export interface UseMoviesThemeSuggestionBindings {
  readonly open: Ref<boolean>;
  setOpen(next: boolean): void;
  switchSystemThemeToDark(): void;
}

export function useMoviesThemeSuggestion({
  kernel,
  now = () => new Date(),
  storageNamespace = activeProfileKvNamespace(MOVIES_THEME_SUGGESTION_KV_NAMESPACE),
}: UseMoviesThemeSuggestionOptions): UseMoviesThemeSuggestionBindings {
  const activeShellId = ref<MoviesThemeSuggestionShellId>(detectActiveShell());
  const isDesktop = computed(() => activeShellId.value === "desktop");
  const open = ref(false);
  const kv = new KVStore<MoviesThemeSuggestionState>(storageNamespace, { version: 1 });
  let stopShellChangedListener: (() => void) | undefined;

  function shouldShow(): boolean {
    const theme = kernel?.theme;
    return (
      theme !== undefined && theme.current() === "light" && isDesktop.value && !wasShownToday()
    );
  }

  function setOpen(next: boolean): void {
    open.value = next;
  }

  function show(): void {
    markShownToday();
    setOpen(true);
  }

  function switchSystemThemeToDark(): void {
    kernel?.theme?.setTheme("dark");
    setOpen(false);
  }

  function wasShownToday(): boolean {
    return kv.get(MOVIES_THEME_SUGGESTION_KV_KEY)?.lastPromptDate === todayKey();
  }

  function markShownToday(): void {
    kv.set(MOVIES_THEME_SUGGESTION_KV_KEY, { lastPromptDate: todayKey() });
  }

  function todayKey(): string {
    const today = now();
    const month = String(today.getMonth() + 1).padStart(DATE_PART_PAD_LENGTH, "0");
    const day = String(today.getDate()).padStart(DATE_PART_PAD_LENGTH, "0");
    return `${today.getFullYear()}-${month}-${day}`;
  }

  function refreshActiveShell(): void {
    activeShellId.value = detectActiveShell();
  }

  onMounted(() => {
    refreshActiveShell();
    stopShellChangedListener = kernel?.events.on("shell.changed", (payload) => {
      activeShellId.value = payload.shellId;
    });
    if (typeof window !== "undefined") {
      window.addEventListener("resize", refreshActiveShell);
    }
    if (shouldShow()) {
      show();
    }
  });

  onUnmounted(() => {
    stopShellChangedListener?.();
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", refreshActiveShell);
    }
    kv.dispose();
  });

  watch(isDesktop, (nextIsDesktop) => {
    if (!nextIsDesktop) {
      setOpen(false);
    }
  });

  return {
    open,
    setOpen,
    switchSystemThemeToDark,
  };
}

function detectActiveShell(): MoviesThemeSuggestionShellId {
  if (typeof document !== "undefined") {
    const shellId = document.documentElement.dataset.shell;
    if (shellId === "mobile" || shellId === "desktop") {
      return shellId;
    }
  }

  if (typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_WIDTH) {
    return "mobile";
  }

  return "desktop";
}
