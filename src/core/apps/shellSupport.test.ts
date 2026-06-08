import { describe, expect, it } from "vitest";

import { appSupportsShell, appUnsupportedShellMessage } from "./shellSupport";

describe("app shell support", () => {
  it("defaults apps to every shell", () => {
    expect(appSupportsShell({}, "desktop")).toBe(true);
    expect(appSupportsShell({}, "mobile")).toBe(true);
  });

  it("honors explicit shell allow-lists", () => {
    const manifest = { supportedShells: ["desktop"] as const };

    expect(appSupportsShell(manifest, "desktop")).toBe(true);
    expect(appSupportsShell(manifest, "mobile")).toBe(false);
  });

  it("describes a desktop-only app opened from mobile", () => {
    expect(
      appUnsupportedShellMessage({ name: "Desktop Tool", supportedShells: ["desktop"] }, "mobile"),
    ).toBe("Desktop Tool is not supported on mobile. Open it from the desktop shell.");
  });
});
