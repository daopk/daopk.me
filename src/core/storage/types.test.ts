import { describe, expect, it } from "vitest";

import { StorageError } from "~/core/storage/types";

describe("StorageError", () => {
  it("is instanceof Error", () => {
    const err = new StorageError("boom", { code: "TEST" });

    expect(err).toBeInstanceOf(Error);

    expect(err).toBeInstanceOf(StorageError);

    expect(err.code).toBe("TEST");
  });

  it("preserves structured cause", () => {
    const root = new Error("underlying");

    const err = new StorageError("wrap", {
      cause: root,
    });

    expect(err.cause).toBe(root);
  });
});
