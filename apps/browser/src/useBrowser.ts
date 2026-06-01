import { computed, ref } from "vue";

export interface BrowserQuickLink {
  readonly label: string;
  readonly url: string;
  readonly iconLabel: string;
}

export type BrowserHistoryEntry =
  | {
      readonly kind: "start";
      readonly title: string;
    }
  | {
      readonly kind: "web";
      readonly title: string;
      readonly url: string;
    };

export type BrowserNavigationTarget =
  | {
      readonly kind: "start";
    }
  | {
      readonly kind: "web";
      readonly url: string;
    };

export interface BrowserHistoryJump {
  readonly entry: BrowserHistoryEntry;
  readonly index: number;
}

export type BrowserTargetResult =
  | {
      readonly ok: true;
      readonly target: BrowserNavigationTarget;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export interface UseBrowserOptions {
  readonly initialUrl?: unknown;
}

const START_ENTRY: BrowserHistoryEntry = { kind: "start", title: "Start" };
const START_MESSAGE = "Start page.";
const BLOCKED_PREVIEW_MESSAGE = "This site could not be embedded. Open externally.";
const UNSUPPORTED_PROTOCOL_MESSAGE = "Browser can only open http:// and https:// URLs.";
const SEARCH_URL = "https://www.google.com/search?igu=1";

export const BROWSER_HOME_URL = "https://www.google.com/webhp?igu=1";

export const BROWSER_QUICK_LINKS: readonly BrowserQuickLink[] = [
  { label: "Google", url: BROWSER_HOME_URL, iconLabel: "G" },
  { label: "Wikipedia", url: "https://www.wikipedia.org/", iconLabel: "W" },
  { label: "Archive", url: "https://archive.org/", iconLabel: "A" },
];

export function isEmbeddablePreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveBrowserTarget(input: string): BrowserTargetResult {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { ok: true, target: { kind: "start" } };
  }

  const candidate = normalizeCandidate(trimmed);
  if (candidate === null) {
    return {
      ok: false,
      reason: UNSUPPORTED_PROTOCOL_MESSAGE,
    };
  }

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return {
      ok: false,
      reason: "Enter a valid web address.",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      reason: UNSUPPORTED_PROTOCOL_MESSAGE,
    };
  }

  return {
    ok: true,
    target: {
      kind: "web",
      url: url.href,
    },
  };
}

export function useBrowser(options: UseBrowserOptions = {}) {
  const history = ref<BrowserHistoryEntry[]>([START_ENTRY]);
  const index = ref(0);
  const reloadKey = ref(0);
  const message = ref(START_MESSAGE);
  const previewErrorUrl = ref<string | null>(null);

  const current = computed<BrowserHistoryEntry>(() => history.value[index.value] ?? START_ENTRY);
  const address = computed(() => (current.value.kind === "web" ? current.value.url : ""));
  const canPreview = computed(
    () => current.value.kind === "web" && isEmbeddablePreviewUrl(current.value.url),
  );
  const previewBlocked = computed(
    () => current.value.kind === "web" && previewErrorUrl.value === current.value.url,
  );
  const isLoading = ref(false);
  const iframeSrc = computed(() =>
    canPreview.value && !previewBlocked.value && current.value.kind === "web"
      ? current.value.url
      : null,
  );
  const iframeKey = computed(() =>
    canPreview.value && !previewBlocked.value && current.value.kind === "web"
      ? `${current.value.url}:${reloadKey.value}`
      : "start",
  );
  const canGoBack = computed(() => index.value > 0);
  const canGoForward = computed(() => index.value < history.value.length - 1);
  const backHistory = computed<BrowserHistoryJump[]>(() =>
    history.value
      .slice(0, index.value)
      .map((entry, entryIndex) => ({ entry, index: entryIndex }))
      .reverse(),
  );
  const forwardHistory = computed<BrowserHistoryJump[]>(() =>
    history.value.slice(index.value + 1).map((entry, offset) => ({
      entry,
      index: index.value + 1 + offset,
    })),
  );
  const historyLength = computed(() => history.value.length);
  const historyIndex = computed(() => index.value);
  const currentHost = computed(() => {
    if (current.value.kind !== "web") {
      return "";
    }

    return new URL(current.value.url).host;
  });
  const isSecure = computed(
    () => current.value.kind === "web" && new URL(current.value.url).protocol === "https:",
  );
  const faviconUrl = computed(() => {
    if (current.value.kind !== "web") {
      return null;
    }

    return `${new URL(current.value.url).origin}/favicon.ico`;
  });

  const initialUrl = typeof options.initialUrl === "string" ? options.initialUrl : "";
  const result = resolveBrowserTarget(initialUrl.trim().length > 0 ? initialUrl : BROWSER_HOME_URL);
  if (result.ok && result.target.kind === "web") {
    openTarget(result.target, { replace: true });
  } else {
    openTarget({ kind: "web", url: BROWSER_HOME_URL }, { replace: true });
  }

  function navigate(input: string): boolean {
    const result = resolveBrowserTarget(input);

    if (!result.ok) {
      message.value = result.reason;
      return false;
    }

    return openTarget(result.target);
  }

  function goHome(): boolean {
    return openTarget({ kind: "web", url: BROWSER_HOME_URL });
  }

  function goBack(): boolean {
    if (!canGoBack.value) {
      return false;
    }

    index.value -= 1;
    syncEntryState();
    return true;
  }

  function goForward(): boolean {
    if (!canGoForward.value) {
      return false;
    }

    index.value += 1;
    syncEntryState();
    return true;
  }

  function jumpToHistory(nextIndex: number): boolean {
    if (nextIndex < 0 || nextIndex >= history.value.length || nextIndex === index.value) {
      return false;
    }

    index.value = nextIndex;
    syncEntryState();
    return true;
  }

  function reload(): boolean {
    if (current.value.kind !== "web") {
      isLoading.value = false;
      message.value = START_MESSAGE;
      return false;
    }

    previewErrorUrl.value = null;
    reloadKey.value += 1;
    isLoading.value = isEmbeddablePreviewUrl(current.value.url);
    message.value = isLoading.value ? `Loading ${current.value.url}` : BLOCKED_PREVIEW_MESSAGE;
    return true;
  }

  function finishLoad(): boolean {
    if (current.value.kind !== "web") {
      return false;
    }

    isLoading.value = false;
    message.value = `Loaded ${current.value.url}`;
    return true;
  }

  function markPreviewError(): void {
    if (current.value.kind !== "web") {
      return;
    }

    isLoading.value = false;
    previewErrorUrl.value = current.value.url;
    message.value = BLOCKED_PREVIEW_MESSAGE;
  }

  function syncEntryState(): void {
    previewErrorUrl.value = null;
    isLoading.value = current.value.kind === "web" && isEmbeddablePreviewUrl(current.value.url);
    message.value = messageForEntry(current.value, isLoading.value);
  }

  function openTarget(target: BrowserNavigationTarget, options?: { replace?: boolean }): boolean {
    const next = entryFromTarget(target);

    if (entriesMatch(current.value, next)) {
      if (next.kind === "web") {
        if (isEmbeddablePreviewUrl(next.url)) {
          previewErrorUrl.value = null;
          reloadKey.value += 1;
          isLoading.value = true;
          message.value = `Loading ${next.url}`;
        } else {
          isLoading.value = false;
          message.value = BLOCKED_PREVIEW_MESSAGE;
        }
      } else {
        isLoading.value = false;
        message.value = START_MESSAGE;
      }
      return true;
    }

    previewErrorUrl.value = null;
    if (options?.replace === true) {
      history.value[index.value] = next;
    } else {
      history.value = [...history.value.slice(0, index.value + 1), next];
      index.value = history.value.length - 1;
    }

    isLoading.value = next.kind === "web" && isEmbeddablePreviewUrl(next.url);
    message.value = messageForEntry(next, isLoading.value);
    return true;
  }

  return {
    address,
    backHistory,
    canPreview,
    canGoBack,
    canGoForward,
    current,
    currentHost,
    faviconUrl,
    finishLoad,
    forwardHistory,
    historyIndex,
    historyLength,
    iframeKey,
    iframeSrc,
    isLoading,
    isSecure,
    jumpToHistory,
    message,
    previewBlocked,
    reloadKey,
    goBack,
    goForward,
    goHome,
    markPreviewError,
    navigate,
    reload,
  };
}

function normalizeCandidate(input: string): string | null {
  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  if (hasScheme(input) && !looksLikeHostPort(input)) {
    return null;
  }

  if (isSearchQuery(input)) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", input);
    return url.href;
  }

  return `${defaultProtocolFor(input)}://${input}`;
}

function hasScheme(input: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(input);
}

function looksLikeHostPort(input: string): boolean {
  return /^(\[[^\]]+\]|[^/?#\s:]+):\d{1,5}(?:[/?#]|$)/.test(input);
}

function defaultProtocolFor(input: string): "http" | "https" {
  const host =
    input
      .split(/[/?#]/, 1)[0]
      ?.replace(/:\d{1,5}$/, "")
      .toLowerCase() ?? "";
  if (isLocalHost(host)) {
    return "http";
  }

  return "https";
}

function isSearchQuery(input: string): boolean {
  const host = input.split(/[/?#]/, 1)[0]?.toLowerCase() ?? "";

  if (/\s/.test(input)) {
    return true;
  }

  if (isLocalHost(host) || looksLikeHostPort(input) || isIpv4Address(host)) {
    return false;
  }

  return !host.includes(".");
}

function isLocalHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function isIpv4Address(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function entryFromTarget(target: BrowserNavigationTarget): BrowserHistoryEntry {
  if (target.kind === "start") {
    return START_ENTRY;
  }

  return {
    kind: "web",
    title: titleForUrl(target.url),
    url: target.url,
  };
}

function entriesMatch(a: BrowserHistoryEntry, b: BrowserHistoryEntry): boolean {
  if (a.kind !== b.kind) {
    return false;
  }

  return a.kind === "start" || a.url === (b as Extract<BrowserHistoryEntry, { kind: "web" }>).url;
}

function messageForEntry(entry: BrowserHistoryEntry, loading = false): string {
  if (entry.kind === "start") {
    return START_MESSAGE;
  }

  if (!isEmbeddablePreviewUrl(entry.url)) {
    return BLOCKED_PREVIEW_MESSAGE;
  }

  return loading ? `Loading ${entry.url}` : entry.url;
}

function titleForUrl(url: string): string {
  const parsed = new URL(url);
  const query =
    parsed.hostname === "duckduckgo.com" || parsed.hostname === "www.google.com"
      ? parsed.searchParams.get("q")
      : null;

  if (query) {
    return `Search: ${query}`;
  }

  return parsed.host;
}
