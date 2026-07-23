import { describe, expect, it, vi } from "vitest";

import {
  handleShellOpenRequest,
  type ShellOpenRequestAction,
  type ShellOpenRequestAdapter,
  type ShellOpenRequestEntry,
} from "./shellOpenRequests";

interface TestEntry extends ShellOpenRequestEntry {
  readonly id: string;
}

function testAdapter(entries: readonly TestEntry[]): {
  readonly adapter: ShellOpenRequestAdapter<TestEntry>;
  readonly apply: ReturnType<typeof vi.fn<(action: ShellOpenRequestAction<TestEntry>) => void>>;
} {
  const apply = vi.fn<(action: ShellOpenRequestAction<TestEntry>) => void>();

  return {
    adapter: {
      findPreferred: (manifestId, predicate) =>
        entries.find((entry) => entry.manifestId === manifestId && predicate(entry)) ?? null,
      apply,
    },
    apply,
  };
}

describe("shell open requests", () => {
  it("normalizes paths and focuses the preferred entry already showing the document", async () => {
    const matching: TestEntry = {
      id: "editor-a",
      manifestId: "editor",
      args: { path: "/home/notes/../a.md" },
    };
    const { adapter, apply } = testAdapter([
      matching,
      { id: "editor-empty", manifestId: "editor", documentPath: null },
    ]);

    await handleShellOpenRequest({ manifestId: "editor", path: "/home/./a.md" }, adapter);

    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith({
      type: "focus",
      target: matching,
      manifestId: "editor",
      path: "/home/a.md",
    });
  });

  it("reuses only an Editor that explicitly reports an empty document", async () => {
    const unconfirmed: TestEntry = { id: "editor-unknown", manifestId: "editor" };
    const empty: TestEntry = {
      id: "editor-empty",
      manifestId: "editor",
      documentPath: null,
    };
    const { adapter, apply } = testAdapter([unconfirmed, empty]);

    await handleShellOpenRequest({ manifestId: "editor", path: "/home/new.md" }, adapter);

    expect(apply).toHaveBeenCalledWith({
      type: "reuse-editor",
      target: empty,
      path: "/home/new.md",
    });
  });

  it("spawns each app with normalized app-specific arguments", async () => {
    const { adapter, apply } = testAdapter([]);

    await handleShellOpenRequest({ manifestId: "editor", path: "/home/./draft.md" }, adapter);
    await handleShellOpenRequest(
      { manifestId: "blog", path: "/home/posts/./field-notes.md", slug: "field-notes" },
      adapter,
    );
    await handleShellOpenRequest(
      { manifestId: "pdf-viewer", path: "/docs/old/../guide.pdf" },
      adapter,
    );

    expect(apply.mock.calls.map(([action]) => action)).toEqual([
      {
        type: "spawn",
        manifestId: "editor",
        args: { path: "/home/draft.md" },
      },
      {
        type: "spawn",
        manifestId: "blog",
        args: { path: "/home/posts/field-notes.md", slug: "field-notes" },
      },
      {
        type: "spawn",
        manifestId: "pdf-viewer",
        args: { path: "/docs/guide.pdf" },
      },
    ]);
  });

  it("ignores malformed paths and invalid Blog slugs", async () => {
    const { adapter, apply } = testAdapter([]);

    await handleShellOpenRequest({ manifestId: "editor", path: "relative.md" }, adapter);
    await handleShellOpenRequest(
      { manifestId: "blog", path: "/home/posts/post.md", slug: "../post" },
      adapter,
    );

    expect(apply).not.toHaveBeenCalled();
  });
});
