import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticHTTPAdapter } from "~/core/vfs/adapters/StaticHTTPAdapter";
import { normalizeVfsPath } from "~/core/vfs/path";

const encoder = new TextEncoder();

function response(body: string, status = 200): Response {
  const bytes = encoder.encode(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "text/plain" : null),
    },
    arrayBuffer: async () => bytes.buffer,
  } as Response;
}

describe("StaticHTTPAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists manifest-backed directories without fetching", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const adapter = new StaticHTTPAdapter({
      entries: [{ path: "/docs/readme.md", url: "/static/readme.md", size: 12 }],
    });

    const root = await adapter.list(normalizeVfsPath("/"));
    expect(root).toEqual([expect.objectContaining({ name: "docs", kind: "directory" })]);

    const docs = await adapter.list(normalizeVfsPath("/docs"));
    expect(docs).toEqual([expect.objectContaining({ name: "readme.md", size: 12 })]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches bytes lazily when reading files", async () => {
    const fetch = vi.fn().mockResolvedValue(response("hello"));
    vi.stubGlobal("fetch", fetch);
    const adapter = new StaticHTTPAdapter({
      entries: [{ path: "/readme.txt", url: "/static/readme.txt" }],
    });

    const read = await adapter.read(normalizeVfsPath("/readme.txt"));
    expect(fetch).toHaveBeenCalledWith("/static/readme.txt");
    expect(new TextDecoder().decode(read.bytes)).toBe("hello");
    expect(read.stat).toMatchObject({ size: 5, mimeType: "text/plain", readonly: true });
  });

  it("throws typed errors for read-only writes and missing static files", async () => {
    const fetch = vi.fn().mockResolvedValue(response("missing", 404));
    vi.stubGlobal("fetch", fetch);
    const adapter = new StaticHTTPAdapter({
      entries: [{ path: "/missing.txt", url: "/static/missing.txt" }],
    });

    await expect(
      adapter.write(normalizeVfsPath("/missing.txt"), new Uint8Array()),
    ).rejects.toMatchObject({ code: "READ_ONLY" });
    await expect(adapter.read(normalizeVfsPath("/missing.txt"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
