import { describe, expect, it } from "vitest";

import { RPC_ENVELOPE_VERSION, unwrapRpcEnvelope, wrapRpcMethod } from "~/core/ipc/rpc";
import { MiniSearchIndex, type SearchIndexedDoc } from "~/core/search/MiniSearchIndex";
import { createSearchWorkerApi } from "~/workers/search.worker";

describe("search.worker API", () => {
  it("indexes clone-safe docs and queries through the worker API shape", () => {
    const api = createSearchWorkerApi(new MiniSearchIndex());

    api.rebuild([
      {
        docId: "command:theme:toggle",
        kind: "command",
        rawId: "theme:toggle",
        title: "Toggle Theme",
        hint: "",
        keywords: "dark light",
        rawIdSearchable: "theme:toggle",
      } satisfies SearchIndexedDoc,
    ]);

    expect(api.query("dark").some((hit) => hit.id === "theme:toggle")).toBe(true);
  });

  it("replaces and removes individual docs", () => {
    const api = createSearchWorkerApi(new MiniSearchIndex());

    api.replace({
      docId: "app:notes",
      kind: "app",
      rawId: "notes",
      title: "Notes",
      hint: "productivity",
      keywords: "",
      rawIdSearchable: "notes",
    });

    expect(api.query("notes").some((hit) => hit.id === "notes")).toBe(true);

    api.remove("app:notes");
    expect(api.query("notes").every((hit) => hit.id !== "notes")).toBe(true);
  });

  it("replaces many docs and removes VFS subtrees exactly", () => {
    const api = createSearchWorkerApi(new MiniSearchIndex());

    api.replaceMany([
      {
        docId: "vfs:/home/a",
        kind: "vfs",
        rawId: "/home/a",
        title: "Alpha",
        hint: "/home/a",
        keywords: "",
        rawIdSearchable: "/home/a",
        vfs: { path: "/home/a", entryKind: "file" },
      },
      {
        docId: "vfs:/home/about.md",
        kind: "vfs",
        rawId: "/home/about.md",
        title: "About sibling",
        hint: "/home/about.md",
        keywords: "",
        rawIdSearchable: "/home/about.md",
        vfs: { path: "/home/about.md", entryKind: "file" },
      },
    ] satisfies SearchIndexedDoc[]);

    api.removeVfsSubtree("/home/a");

    expect(api.query("Alpha", { kind: "vfs" })).toEqual([]);
    expect(api.query("sibling", { kind: "vfs" })).toEqual([
      expect.objectContaining({ id: "/home/about.md" }),
    ]);
  });

  it("matches RpcRelay's versioned envelope contract when wrapped", async () => {
    const api = createSearchWorkerApi(new MiniSearchIndex());
    const ready = wrapRpcMethod(api.ready);
    const rebuild = wrapRpcMethod(api.rebuild);
    const query = wrapRpcMethod(api.query);

    await expect(ready()).resolves.toEqual({
      version: RPC_ENVELOPE_VERSION,
      ok: true,
    });

    await expect(rebuild([])).resolves.toEqual({
      version: RPC_ENVELOPE_VERSION,
      ok: true,
    });

    await expect(query("theme")).resolves.toMatchObject({
      version: RPC_ENVELOPE_VERSION,
      ok: true,
      value: [],
    });

    const envelope = await query("theme");
    expect(unwrapRpcEnvelope(envelope)).toEqual([]);
  });
});
