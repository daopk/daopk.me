import {
  isFirstPartyAppProtocolUrl,
  parseAppProtocolIntent,
  parseYouTubePlayerUrlIntent,
} from "@daopk/sdk";

export interface BlogLaunchIntent {
  readonly manifestId: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

export type BlogContentLinkAction =
  | { readonly kind: "block" }
  | { readonly kind: "ignore" }
  | { readonly kind: "launch"; readonly intent: BlogLaunchIntent };

export function anchorFromClick(event: MouseEvent): HTMLAnchorElement | null {
  if (!(event.target instanceof Element)) {
    return null;
  }

  const anchor = event.target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

export function isPlainPrimaryClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function blogContentLinkActionFromHref(
  href: string,
  plainPrimaryClick: boolean,
): BlogContentLinkAction {
  const protocolIntent = parseAppProtocolIntent(href);
  if (protocolIntent.kind === "app") {
    return { kind: "launch", intent: protocolIntent };
  }

  if (isFirstPartyAppProtocolUrl(href)) {
    return { kind: "block" };
  }

  if (!plainPrimaryClick) {
    return { kind: "ignore" };
  }

  const youtubeIntent = parseYouTubePlayerUrlIntent(href);
  if (youtubeIntent.kind !== "app") {
    return { kind: "ignore" };
  }

  return { kind: "launch", intent: youtubeIntent };
}
