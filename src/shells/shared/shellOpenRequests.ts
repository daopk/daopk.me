import { normalizeDocumentOpenPath } from "~/shells/shared/documentOpenRouting";

export function normalizeShellOpenRequestPath(
  logScope: string,
  eventName: string,
  path: string,
): string | null {
  return normalizeDocumentOpenPath(logScope, eventName, path);
}

export function topmostManifestRecord<
  T extends { readonly manifestId: string; readonly z: number },
>(records: readonly T[], manifestId: string, predicate: (record: T) => boolean): T | null {
  let topmost: T | null = null;

  for (const record of records) {
    if (record.manifestId !== manifestId || !predicate(record)) {
      continue;
    }
    if (topmost === null || record.z > topmost.z) {
      topmost = record;
    }
  }

  return topmost;
}

export function preferredManifestFrame<
  T extends { readonly frameId: string; readonly manifestId: string },
>(
  frames: readonly T[],
  foregroundFrameId: string | null,
  manifestId: string,
  predicate: (frame: T) => boolean,
): T | null {
  const candidates = frames.filter((frame) => frame.manifestId === manifestId && predicate(frame));
  if (candidates.length === 0) {
    return null;
  }

  return candidates.find((frame) => frame.frameId === foregroundFrameId) ?? candidates.at(-1)!;
}
