import { describe, expect, it, vi } from "vitest";

import { RemoteHTTPIndexAdapter } from "~/core/vfs/adapters/RemoteHTTPIndexAdapter";
import { normalizeVfsPath } from "~/core/vfs/path";

const INDEX_URL = "/_worker/files/index.json";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });
}

function textResponse(body: string, contentType = "text/plain;charset=utf-8"): Response {
  return new Response(body, {
    headers: { "Content-Type": contentType },
  });
}

describe("RemoteHTTPIndexAdapter", () => {
  it("builds nested read-only directories from remote file keys", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse([
        {
          key: "docs/spec.pdf",
          kind: "file",
          url: "/_worker/files/raw/docs/spec.pdf",
          size: 9,
          uploaded: "2026-05-31T12:00:00.000Z",
          contentType: "application/pdf",
        },
        {
          key: "notes/readme.md",
          kind: "file",
          url: "/_worker/files/raw/notes/readme.md",
          size: 12,
          uploaded: "2026-06-01T12:00:00.000Z",
          contentType: "text/markdown;charset=utf-8",
        },
      ]),
    );
    const adapter = new RemoteHTTPIndexAdapter({ indexUrl: INDEX_URL, fetch });

    await expect(adapter.list(normalizeVfsPath("/"))).resolves.toEqual([
      expect.objectContaining({ name: "docs", kind: "directory", readonly: true }),
      expect.objectContaining({ name: "notes", kind: "directory", readonly: true }),
    ]);
    await expect(adapter.list(normalizeVfsPath("/docs"))).resolves.toEqual([
      expect.objectContaining({
        name: "spec.pdf",
        size: 9,
        readonly: true,
        mimeType: "application/pdf",
      }),
    ]);
    expect(fetch).toHaveBeenCalledWith(INDEX_URL, {
      headers: { Accept: "application/json" },
    });
  });

  it("surfaces folder marker keys as directories", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse([{ key: "empty/", kind: "directory", uploaded: "2026-05-31T12:00:00.000Z" }]),
    );
    const adapter = new RemoteHTTPIndexAdapter({ indexUrl: INDEX_URL, fetch });

    await expect(adapter.stat(normalizeVfsPath("/empty"))).resolves.toEqual(
      expect.objectContaining({ path: "/empty", kind: "directory", readonly: true }),
    );
    await expect(adapter.list(normalizeVfsPath("/empty"))).resolves.toEqual([]);
  });

  it("fetches file bytes lazily from the entry URL", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === INDEX_URL) {
        return jsonResponse([
          {
            key: "notes/readme.md",
            kind: "file",
            url: "/_worker/files/raw/notes/readme.md",
            size: 12,
            uploaded: "2026-06-01T12:00:00.000Z",
            contentType: "text/markdown;charset=utf-8",
          },
        ]);
      }

      return textResponse("# Cloud\n", "text/markdown;charset=utf-8");
    });
    const adapter = new RemoteHTTPIndexAdapter({ indexUrl: INDEX_URL, fetch });

    const read = await adapter.read(normalizeVfsPath("/notes/readme.md"));

    expect(fetch).toHaveBeenCalledWith("/_worker/files/raw/notes/readme.md");
    expect(new TextDecoder().decode(read.bytes)).toBe("# Cloud\n");
    expect(read.stat).toMatchObject({
      size: "# Cloud\n".length,
      mimeType: "text/markdown;charset=utf-8",
      readonly: true,
    });
  });

  it("rejects writes, mkdir, and remove as read-only operations", async () => {
    const fetch = vi.fn(async () => jsonResponse([]));
    const adapter = new RemoteHTTPIndexAdapter({ indexUrl: INDEX_URL, fetch });

    await expect(adapter.write(normalizeVfsPath("/a.txt"), new Uint8Array())).rejects.toMatchObject(
      {
        code: "READ_ONLY",
      },
    );
    await expect(adapter.mkdir(normalizeVfsPath("/folder"))).rejects.toMatchObject({
      code: "READ_ONLY",
    });
    await expect(adapter.remove(normalizeVfsPath("/a.txt"))).rejects.toMatchObject({
      code: "READ_ONLY",
    });
  });
});
