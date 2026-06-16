import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { bytesToBase64Url, isArrayBuffer, toUint8Array } from "~/core/profile/encoding";

describe("profile encoding helpers", () => {
  it("accepts ArrayBuffers created in a different JavaScript realm", () => {
    const foreignBuffer = runInNewContext("new Uint8Array([1, 2, 3, 4]).buffer") as ArrayBuffer;

    expect(foreignBuffer instanceof ArrayBuffer).toBe(false);
    expect(isArrayBuffer(foreignBuffer)).toBe(true);
    expect(Array.from(toUint8Array(foreignBuffer))).toEqual([1, 2, 3, 4]);
    expect(bytesToBase64Url(foreignBuffer)).toBe("AQIDBA");
  });
});
