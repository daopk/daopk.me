import type { TelemetryEnvelope, TelemetryEvent, TelemetryTransport } from "~/types/telemetry";

export interface TelemetryBusOptions {
  isEnabled: () => boolean;
  transport?: TelemetryTransport;
  now?: () => number;
}

export class NoopTelemetryTransport implements TelemetryTransport {
  send(_envelope: TelemetryEnvelope): void {
    void _envelope;
  }
}

export class TelemetryBus {
  private readonly isEnabledRef: () => boolean;
  private readonly now: () => number;
  private readonly defaultTransport = new NoopTelemetryTransport();
  private transport: TelemetryTransport;

  constructor(options: TelemetryBusOptions) {
    this.isEnabledRef = options.isEnabled;
    this.now = options.now ?? (() => Date.now());
    this.transport = options.transport ?? this.defaultTransport;
  }

  isEnabled(): boolean {
    try {
      return this.isEnabledRef();
    } catch {
      return false;
    }
  }

  track(event: TelemetryEvent): boolean {
    if (!this.isEnabled()) {
      return false;
    }

    const envelope = {
      ...event,
      payload: sanitizePayload(event.payload),
      schemaVersion: 1,
      timestamp: this.now(),
    } as TelemetryEnvelope;

    try {
      void Promise.resolve(this.transport.send(envelope)).catch(() => undefined);
    } catch {
      // Telemetry must never affect product behavior.
    }

    return true;
  }

  setTransport(transport: TelemetryTransport): () => void {
    const previous = this.transport;
    this.transport = transport;

    return () => {
      if (this.transport === transport) {
        this.transport.dispose?.();
        this.transport = previous;
      }
    };
  }

  resetTransport(): void {
    this.transport.dispose?.();
    this.transport = this.defaultTransport;
  }
}

export function nowMs(): number {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return Date.now();
}

export function durationSince(startedAt: number): number {
  const duration = nowMs() - startedAt;
  if (!Number.isFinite(duration) || duration < 0) {
    return 0;
  }

  return Math.round(duration);
}

function sanitizePayload(payload: TelemetryEvent["payload"]): TelemetryEvent["payload"] {
  if ("durationMs" in payload) {
    return {
      ...payload,
      durationMs: sanitizeDuration(payload.durationMs),
    };
  }

  return payload;
}

function sanitizeDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round(value);
}
