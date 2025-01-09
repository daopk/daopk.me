import { describe, expect, it } from "vitest";

import { createDetachedPortPair } from "~/core/ipc/channel";

describe("createDetachedPortPair", () => {
  it("returns a real MessageChannel pair when the platform supports it", () => {
    const pair = createDetachedPortPair();

    if (pair.length === 0) {
      expect(pair).toEqual([]);

      return;
    }

    expect(pair).toHaveLength(2);
    expect(pair[0]).toHaveProperty("postMessage");
    expect(pair[0]).toHaveProperty("addEventListener");
    expect(pair[1]).toHaveProperty("postMessage");
    expect(pair[1]).toHaveProperty("addEventListener");

    pair[0].close?.();
    pair[1].close?.();
  });
});
