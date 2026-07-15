import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installAxeIfDev } from "./axe-bootstrap";

const axeMocks = vi.hoisted(() => ({
  debugLog: vi.fn(),
  debugWarn: vi.fn(),
  run: vi.fn(),
}));

vi.mock("axe-core", () => ({
  default: { run: axeMocks.run },
}));

vi.mock("~/core/debug", () => ({
  debugLog: axeMocks.debugLog,
  debugWarn: axeMocks.debugWarn,
}));

describe("installAxeIfDev", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    axeMocks.debugLog.mockReset();
    axeMocks.debugWarn.mockReset();
    axeMocks.run.mockReset();
    axeMocks.run.mockResolvedValue({ violations: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs an initial debounced DOM audit", async () => {
    const dispose = await installAxeIfDev();

    expect(axeMocks.run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);

    expect(axeMocks.run).toHaveBeenCalledOnce();
    expect(axeMocks.run).toHaveBeenCalledWith(document, {
      resultTypes: ["violations"],
    });

    dispose();
  });

  it("coalesces DOM mutations and stops auditing after disposal", async () => {
    const dispose = await installAxeIfDev();
    await vi.advanceTimersByTimeAsync(250);
    axeMocks.run.mockClear();

    document.body.append(document.createElement("main"), document.createElement("aside"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    expect(axeMocks.run).toHaveBeenCalledOnce();

    document.body.appendChild(document.createElement("footer"));
    await Promise.resolve();
    dispose();
    await vi.advanceTimersByTimeAsync(250);

    expect(axeMocks.run).toHaveBeenCalledOnce();
  });

  it("reports violations through the shared debug channel", async () => {
    const violations = [{ id: "button-name", nodes: [{ target: ["button"] }] }];
    axeMocks.run.mockResolvedValue({ violations });
    const dispose = await installAxeIfDev();

    await vi.advanceTimersByTimeAsync(250);

    expect(axeMocks.debugWarn).toHaveBeenCalledWith("[axe] 1 accessibility violation", violations);

    document.body.appendChild(document.createElement("main"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    expect(axeMocks.debugWarn).toHaveBeenCalledOnce();

    violations[0].nodes[0].target = ["#save-button"];
    document.body.appendChild(document.createElement("aside"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    expect(axeMocks.debugWarn).toHaveBeenCalledTimes(2);

    dispose();
  });
});
