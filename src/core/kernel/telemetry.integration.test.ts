import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { kernel } from "~/core/kernel";
import type { TelemetryEnvelope } from "~/types/telemetry";

vi.mock("~/core/debug", () => ({
  debugWarn: vi.fn(),
  debugLog: vi.fn(),
}));

describe("kernel.telemetry (M4.5)", () => {
  const sent: TelemetryEnvelope[] = [];

  beforeEach(async () => {
    sent.length = 0;
    localStorage.clear();
    setActivePinia(createPinia());
    await kernel.init();
    kernel.telemetry.setTransport({
      send(envelope) {
        sent.push(envelope);
      },
    });
  });

  afterEach(() => {
    kernel.commands.unregister("telemetry:test-ok");
    kernel.commands.unregister("telemetry:test-error");
    kernel.dispose();
    localStorage.clear();
  });

  it("is off by default and drops manual events", () => {
    expect(kernel.telemetry.isEnabled()).toBe(false);

    expect(
      kernel.telemetry.track({
        name: "boot.finished",
        payload: {
          durationMs: 12,
          phaseCount: 3,
          status: "complete",
        },
      }),
    ).toBe(false);

    expect(sent).toEqual([]);
  });

  it("records command dispatch counters only after the Privacy opt-in is enabled", async () => {
    kernel.settings.set("telemetryEnabled", true);
    kernel.commands.register({
      id: "telemetry:test-ok",
      title: "Telemetry OK",
      run: vi.fn(),
    });

    await kernel.commands.dispatch("telemetry:test-ok", { source: "spotlight" });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      name: "command.dispatched",
      payload: {
        commandId: "telemetry:test-ok",
        source: "spotlight",
        status: "ok",
      },
      schemaVersion: 1,
    });
    expect(sent[0]?.payload).not.toHaveProperty("args");
  });

  it("records failed command dispatches without swallowing the error", async () => {
    kernel.settings.set("telemetryEnabled", true);
    kernel.commands.register({
      id: "telemetry:test-error",
      title: "Telemetry error",
      run: () => {
        throw new Error("boom");
      },
    });

    await expect(kernel.commands.dispatch("telemetry:test-error")).rejects.toThrow("boom");

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      name: "command.dispatched",
      payload: {
        commandId: "telemetry:test-error",
        source: "api",
        status: "error",
      },
    });
  });

  it("does not record unknown command ids", async () => {
    kernel.settings.set("telemetryEnabled", true);

    await expect(kernel.commands.dispatch("typed-by-user")).rejects.toThrow();

    expect(sent).toEqual([]);
  });
});
