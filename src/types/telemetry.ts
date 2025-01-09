import type { CommandSource } from "~/types/command";

export interface TelemetryEventMap {
  "boot.finished": {
    status: "complete" | "failed" | "cancelled";
    durationMs: number;
    phaseCount: number;
  };
  "command.dispatched": {
    commandId: string;
    source: CommandSource;
    status: "ok" | "error";
    durationMs: number;
  };
}

export type TelemetryEventName = keyof TelemetryEventMap;

export type TelemetryEvent<K extends TelemetryEventName = TelemetryEventName> = {
  [Name in K]: {
    name: Name;
    payload: TelemetryEventMap[Name];
  };
}[K];

export type TelemetryEnvelope<K extends TelemetryEventName = TelemetryEventName> = {
  [Name in K]: TelemetryEvent<Name> & {
    timestamp: number;
    schemaVersion: 1;
  };
}[K];

export interface TelemetryTransport {
  send(envelope: TelemetryEnvelope): void | Promise<void>;
  dispose?(): void;
}

export interface KernelTelemetryFacade {
  isEnabled(): boolean;
  track(event: TelemetryEvent): boolean;
  setTransport(transport: TelemetryTransport): () => void;
}
