import { basename, normalizeVfsPath } from "@daopk/sdk";

export const UNTITLED_NOTE_TITLE = "Untitled note";

const FIRST_H1_PATTERN = /^#\s+(.+?)\s*$/;

export interface ParsedNote {
  readonly title: string;
  readonly body: string;
}

export function parseNoteSource(source: string, path: string): ParsedNote {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const headingIndex = lines.findIndex((line) => FIRST_H1_PATTERN.test(line));

  if (headingIndex < 0) {
    return {
      title: noteTitleFromPath(path),
      body: normalized,
    };
  }

  const match = FIRST_H1_PATTERN.exec(lines[headingIndex]);
  const bodyLines = [...lines.slice(0, headingIndex), ...lines.slice(headingIndex + 1)];
  if (bodyLines[0] === "") {
    bodyLines.shift();
  }

  return {
    title: displayNoteTitle(match?.[1] ?? "", path),
    body: bodyLines.join("\n"),
  };
}

export function noteSource(title: string, body: string): string {
  return `# ${safeNoteHeading(title)}\n\n${body}`;
}

export function noteTitleFromPath(path: string): string {
  const normalized = normalizeVfsPath(path);
  const name = basename(normalized);
  return name.replace(/\.(md|markdown)$/i, "") || UNTITLED_NOTE_TITLE;
}

export function displayNoteTitle(value: string, path: string): string {
  return safeNoteHeading(value) || noteTitleFromPath(path);
}

function safeNoteHeading(value: string): string {
  return value.replace(/\s+/g, " ").trim() || UNTITLED_NOTE_TITLE;
}
