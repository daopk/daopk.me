import { parseAppProtocolIntent, parseYouTubePlayerUrlIntent } from "~/core/routing/appUrlIntents";
import { detectVfsFileType } from "~/core/vfs/fileTypes";

import type { AppPreviewInput, AppPreviewMatch } from "~/types/preview";

export type FirstPartyPreviewMatcherKey = "youtube-url" | "pdf-file";

export function isFirstPartyPreviewMatcherKey(key: string): key is FirstPartyPreviewMatcherKey {
  return key === "youtube-url" || key === "pdf-file";
}

export function resolveFirstPartyPreviewMatcher(
  key: FirstPartyPreviewMatcherKey,
): (input: AppPreviewInput) => AppPreviewMatch | null {
  switch (key) {
    case "youtube-url":
      return youtubePreviewMatch;
    case "pdf-file":
      return pdfPreviewMatch;
  }
}

function youtubePreviewMatch(input: AppPreviewInput): AppPreviewMatch | null {
  if (input.kind !== "url") {
    return null;
  }

  const protocolIntent = parseAppProtocolIntent(input.url);
  if (protocolIntent.kind === "app" && protocolIntent.manifestId === "youtube-player") {
    return { args: protocolIntent.args ?? {} };
  }

  const urlIntent = parseYouTubePlayerUrlIntent(input.url);
  return urlIntent.kind === "app" ? { args: urlIntent.args ?? {} } : null;
}

function pdfPreviewMatch(input: AppPreviewInput): AppPreviewMatch | null {
  if (input.kind !== "vfs-file" || input.entry.kind !== "file") {
    return null;
  }

  return detectVfsFileType(input.entry) === "pdf" ? { args: { path: input.entry.path } } : null;
}
