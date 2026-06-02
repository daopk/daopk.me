import type { FinderBindings } from "./useFinder";

export interface FinderClipboardWriter {
  writeText(text: string): Promise<void>;
}

export interface FinderClipboardBindings {
  copyPath(path: string): Promise<void>;
}

export interface UseFinderClipboardOptions {
  readonly finder: Pick<FinderBindings, "setError">;
  readonly clipboard?: FinderClipboardWriter | null;
}

export function useFinderClipboard({
  finder,
  clipboard = globalThis.navigator?.clipboard ?? null,
}: UseFinderClipboardOptions): FinderClipboardBindings {
  async function copyPath(path: string): Promise<void> {
    if (clipboard === null) {
      finder.setError("Clipboard is unavailable.");
      return;
    }

    try {
      await clipboard.writeText.call(clipboard, path);
      finder.setError(null);
    } catch {
      finder.setError("Finder could not copy the path.");
    }
  }

  return { copyPath };
}
