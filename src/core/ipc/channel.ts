import type { Endpoint } from "comlink";

export type StructuredCloneable = Record<string, unknown>;

export type MessagingPort = Endpoint;

export function createDetachedPortPair(): readonly [MessagingPort, MessagingPort] | [] {
  if (typeof MessageChannel === "undefined") {
    return [];
  }

  const channel = new MessageChannel();

  return [channel.port1, channel.port2];
}
