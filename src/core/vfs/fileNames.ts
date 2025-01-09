export interface SplitFilenameResult {
  readonly stem: string;
  readonly extension: string;
}

export function splitFilename(name: string, fallbackStem = "Untitled"): SplitFilenameResult {
  const index = name.lastIndexOf(".");
  if (index <= 0) {
    return { stem: name || fallbackStem, extension: "" };
  }

  return {
    stem: name.slice(0, index) || fallbackStem,
    extension: name.slice(index),
  };
}
