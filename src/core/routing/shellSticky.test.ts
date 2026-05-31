import { describe, expect, it, vi } from "vitest";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
}));

async function freshModule(): Promise<typeof import("./shellSticky")> {
  vi.resetModules();
  return import("./shellSticky");
}

describe("parseShellQueryOverride", () => {
  it("returns undefined for an empty or whitespace search", async () => {
    const { parseShellQueryOverride } = await freshModule();

    expect(parseShellQueryOverride("")).toBeUndefined();
    expect(parseShellQueryOverride("   ")).toBeUndefined();
  });

  it("returns undefined when there is no shell param", async () => {
    const { parseShellQueryOverride } = await freshModule();

    expect(parseShellQueryOverride("?foo=bar")).toBeUndefined();
  });

  it("parses a valid shell override, tolerating leading '?', case and padding", async () => {
    const { parseShellQueryOverride } = await freshModule();

    expect(parseShellQueryOverride("?shell=mobile")).toBe("mobile");
    expect(parseShellQueryOverride("shell=desktop")).toBe("desktop");
    expect(parseShellQueryOverride("?shell=DESKTOP")).toBe("desktop");
    expect(parseShellQueryOverride("?shell=%20mobile%20")).toBe("mobile");
  });

  it("returns undefined for an unknown shell value", async () => {
    const { parseShellQueryOverride } = await freshModule();

    expect(parseShellQueryOverride("?shell=tablet")).toBeUndefined();
  });
});

describe("ingestShellStickyFromSearchOnce / peekShellStickyOverride", () => {
  it("peeks undefined before anything is ingested", async () => {
    const { peekShellStickyOverride } = await freshModule();

    expect(peekShellStickyOverride()).toBeUndefined();
  });

  it("captures the override from the first ingest", async () => {
    const { ingestShellStickyFromSearchOnce, peekShellStickyOverride } = await freshModule();

    ingestShellStickyFromSearchOnce("?shell=mobile");

    expect(peekShellStickyOverride()).toBe("mobile");
  });

  it("is idempotent — later ingests are ignored", async () => {
    const { ingestShellStickyFromSearchOnce, peekShellStickyOverride } = await freshModule();

    ingestShellStickyFromSearchOnce("?shell=mobile");
    ingestShellStickyFromSearchOnce("?shell=desktop");

    expect(peekShellStickyOverride()).toBe("mobile");
  });
});
