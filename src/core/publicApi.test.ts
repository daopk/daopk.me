import { describe, expect, it } from "vitest";

import { publicApiOrigin, publicApiPathPrefix, publicApiUrl } from "./publicApi";

describe("publicApiUrl", () => {
  it("builds canonical same-origin _api paths", () => {
    expect(publicApiOrigin()).toBe("");
    expect(publicApiPathPrefix()).toBe("/_api");
    expect(publicApiUrl("/public/apps/index.json")).toBe("/_api/public/apps/index.json");
    expect(publicApiUrl("public/photos/index.json")).toBe("/_api/public/photos/index.json");
  });
});
