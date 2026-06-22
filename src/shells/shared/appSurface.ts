/**
 * The fields every shell surface shares regardless of how it is presented.
 * Desktop free-floating windows (`WindowRecord`) and mobile navigation frames
 * (`NavigationFrame`) both extend this, so the document/URL bookkeeping the
 * shells perform in response to `app.document.changed` / `app.url.changed`
 * stays identical instead of being re-implemented per shell.
 */
export interface AppSurfaceRecord {
  readonly handleId: string;
  readonly manifestId: string;
  documentPath?: string | null;
  browserPath?: string | null;
}

/** Finds the surface owned by `handleId` for `manifestId`, if any. */
export function findSurfaceByHandle<T extends AppSurfaceRecord>(
  records: readonly T[],
  handleId: string,
  manifestId: string,
): T | undefined {
  return records.find((record) => record.handleId === handleId && record.manifestId === manifestId);
}

/** Sets `documentPath` on the matching surface; returns whether one matched. */
export function setSurfaceDocumentPath(
  records: readonly AppSurfaceRecord[],
  handleId: string,
  manifestId: string,
  path: string | null,
): boolean {
  const target = findSurfaceByHandle(records, handleId, manifestId);
  if (target === undefined) {
    return false;
  }

  target.documentPath = path;
  return true;
}

/** Sets `browserPath` on the matching surface; returns whether one matched. */
export function setSurfaceBrowserPath(
  records: readonly AppSurfaceRecord[],
  handleId: string,
  manifestId: string,
  path: string | null,
): boolean {
  const target = findSurfaceByHandle(records, handleId, manifestId);
  if (target === undefined) {
    return false;
  }

  target.browserPath = path;
  return true;
}
