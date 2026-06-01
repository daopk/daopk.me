import { describe, expect, it } from "vitest";

import { formatFirstPartyReleaseLabel, isFirstPartyUpdateVersion } from "./versions";

describe("first-party version comparison", () => {
  it("detects major, minor, and patch updates", () => {
    expect(isFirstPartyUpdateVersion("1.0.0", "2.0.0")).toBe(true);
    expect(isFirstPartyUpdateVersion("1.0.0", "1.1.0")).toBe(true);
    expect(isFirstPartyUpdateVersion("1.0.0", "1.0.1")).toBe(true);
  });

  it("does not treat equal or older versions as updates", () => {
    expect(isFirstPartyUpdateVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isFirstPartyUpdateVersion("1.1.0", "1.0.9")).toBe(false);
    expect(isFirstPartyUpdateVersion("2.0.0", "1.9.9")).toBe(false);
  });

  it("uses build numbers when semver is unchanged", () => {
    expect(isFirstPartyUpdateVersion("1.0.1", "1.0.1", 123, 124)).toBe(true);
    expect(isFirstPartyUpdateVersion("1.0.1", "1.0.1", 123, 123)).toBe(false);
    expect(isFirstPartyUpdateVersion("1.0.1", "1.0.1", 124, 123)).toBe(false);
    expect(isFirstPartyUpdateVersion("1.0.1", "1.0.1", undefined, 1)).toBe(true);
  });

  it("still lets semver order win before build numbers", () => {
    expect(isFirstPartyUpdateVersion("1.0.1", "1.0.2", 99, 10)).toBe(true);
    expect(isFirstPartyUpdateVersion("1.0.2", "1.0.1", 10, 99)).toBe(false);
  });

  it("orders prerelease versions below final releases", () => {
    expect(isFirstPartyUpdateVersion("1.0.0-alpha.1", "1.0.0-alpha.2")).toBe(true);
    expect(isFirstPartyUpdateVersion("1.0.0-alpha.2", "1.0.0")).toBe(true);
    expect(isFirstPartyUpdateVersion("1.0.0", "1.0.1-alpha.1")).toBe(true);
    expect(isFirstPartyUpdateVersion("1.0.0", "1.0.0-beta.1")).toBe(false);
  });

  it("ignores invalid current or candidate versions", () => {
    expect(isFirstPartyUpdateVersion(undefined, "1.0.1")).toBe(false);
    expect(isFirstPartyUpdateVersion("dev", "1.0.1")).toBe(false);
    expect(isFirstPartyUpdateVersion("1.0.0", "next")).toBe(false);
  });

  it("formats release labels with build metadata when available", () => {
    expect(formatFirstPartyReleaseLabel("1.0.1", 123)).toBe("v1.0.1+123");
    expect(formatFirstPartyReleaseLabel("1.0.1", 0)).toBe("v1.0.1");
    expect(formatFirstPartyReleaseLabel(undefined, 123)).toBe("No version");
  });
});
