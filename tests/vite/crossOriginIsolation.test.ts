import { describe, expect, it } from "vitest";

import { crossOriginIsolationHeaders } from "../../vite/crossOriginIsolation";

describe("crossOriginIsolationHeaders", () => {
  it("keeps dev and preview servers cross-origin isolated", () => {
    expect(crossOriginIsolationHeaders).toEqual({
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
  });
});
