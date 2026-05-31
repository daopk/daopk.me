import { describe, expect, it } from "vitest";

import { EXTERNAL_APP_ORIGIN_ALLOWLIST, isExternalOriginAllowed } from "./originAllowlist";

describe("isExternalOriginAllowed", () => {
  it("allows any origin when the allowlist is empty (default posture)", () => {
    expect(EXTERNAL_APP_ORIGIN_ALLOWLIST).toEqual([]);
    expect(isExternalOriginAllowed("https://anything.example.com", [])).toBe(true);
    expect(isExternalOriginAllowed("https://anything.example.com")).toBe(true);
  });

  it("permits only exact origin matches when the allowlist is non-empty", () => {
    const allowlist = ["https://trusted.example.com"];
    expect(isExternalOriginAllowed("https://trusted.example.com", allowlist)).toBe(true);
    expect(isExternalOriginAllowed("https://evil.example.com", allowlist)).toBe(false);
    // Same host, different scheme/port is a different origin.
    expect(isExternalOriginAllowed("http://trusted.example.com", allowlist)).toBe(false);
    expect(isExternalOriginAllowed("https://trusted.example.com:8443", allowlist)).toBe(false);
  });
});
