import { afterEach, describe, expect, it, vi } from "vitest";

import { createKernelVfs } from "~/core/kernel/kernelVfs";

describe("createKernelVfs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts the read-only cloud drive at /cloud", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              key: "docs/spec.pdf",
              kind: "file",
              url: "/public/files/raw/docs/spec.pdf",
              size: 9,
              uploaded: "2026-06-01T00:00:00.000Z",
              contentType: "application/pdf",
            },
          ]),
          { headers: { "Content-Type": "application/json;charset=utf-8" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);

    const vfs = createKernelVfs();

    await expect(vfs.list("/")).resolves.toEqual([
      expect.objectContaining({ path: "/cloud", kind: "directory", readonly: true }),
      expect.objectContaining({ path: "/home", kind: "directory" }),
      expect.objectContaining({ path: "/tmp", kind: "directory" }),
    ]);
    await expect(vfs.stat("/cloud")).resolves.toEqual(
      expect.objectContaining({ path: "/cloud", kind: "directory", readonly: true }),
    );
    await expect(vfs.list("/cloud/docs")).resolves.toEqual([
      expect.objectContaining({ path: "/cloud/docs/spec.pdf", readonly: true }),
    ]);

    vfs.dispose();
  });
});
