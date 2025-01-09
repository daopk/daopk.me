import { describe, expect, it, vi } from "vitest";

import { durationSince, TelemetryBus } from "~/core/telemetry/TelemetryBus";
import type { TelemetryEnvelope, TelemetryTransport } from "~/types/telemetry";

function memoryTransport() {
  const sent: TelemetryEnvelope[] = [];
  const transport: TelemetryTransport = {
    send(envelope) {
      sent.push(envelope);
    },
  };

  return { sent, transport };
}

describe("TelemetryBus", () => {
  it("drops events when disabled", () => {
    const { sent, transport } = memoryTransport();
    const bus = new TelemetryBus({
      isEnabled: () => false,
      now: () => 10,
      transport,
    });

    const recorded = bus.track({
      name: "command.dispatched",
      payload: {
        commandId: "theme:toggle",
        durationMs: 4,
        source: "api",
        status: "ok",
      },
    });

    expect(recorded).toBe(false);
    expect(sent).toEqual([]);
  });

  it("wraps enabled events in schema-versioned envelopes", () => {
    const { sent, transport } = memoryTransport();
    const bus = new TelemetryBus({
      isEnabled: () => true,
      now: () => 42,
      transport,
    });

    expect(
      bus.track({
        name: "boot.finished",
        payload: {
          durationMs: 12.4,
          phaseCount: 3,
          status: "complete",
        },
      }),
    ).toBe(true);

    expect(sent).toEqual([
      {
        name: "boot.finished",
        payload: {
          durationMs: 12,
          phaseCount: 3,
          status: "complete",
        },
        schemaVersion: 1,
        timestamp: 42,
      },
    ]);
  });

  it("swallows sync and async transport failures", async () => {
    const syncBus = new TelemetryBus({
      isEnabled: () => true,
      transport: {
        send() {
          throw new Error("offline");
        },
      },
    });

    expect(() =>
      syncBus.track({
        name: "command.dispatched",
        payload: {
          commandId: "theme:toggle",
          durationMs: 1,
          source: "api",
          status: "ok",
        },
      }),
    ).not.toThrow();

    const asyncBus = new TelemetryBus({
      isEnabled: () => true,
      transport: {
        send: vi.fn(async () => {
          throw new Error("blocked");
        }),
      },
    });

    expect(
      asyncBus.track({
        name: "command.dispatched",
        payload: {
          commandId: "theme:toggle",
          durationMs: 1,
          source: "api",
          status: "ok",
        },
      }),
    ).toBe(true);
    await Promise.resolve();
  });

  it("restores the previous transport through the disposer", () => {
    const first = memoryTransport();
    const second = memoryTransport();
    const bus = new TelemetryBus({
      isEnabled: () => true,
      transport: first.transport,
    });

    const restore = bus.setTransport(second.transport);
    bus.track({
      name: "command.dispatched",
      payload: {
        commandId: "finder:open",
        durationMs: 2,
        source: "api",
        status: "ok",
      },
    });
    restore();
    bus.track({
      name: "command.dispatched",
      payload: {
        commandId: "theme:toggle",
        durationMs: 2,
        source: "api",
        status: "ok",
      },
    });

    expect(second.sent).toHaveLength(1);
    expect(first.sent).toHaveLength(1);
    expect(first.sent[0]?.payload).toMatchObject({ commandId: "theme:toggle" });
  });

  it("clamps invalid durations to zero", () => {
    expect(durationSince(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
