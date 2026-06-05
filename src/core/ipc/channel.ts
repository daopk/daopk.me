import type { Endpoint } from "comlink";

export type MessagingPort = Endpoint & Pick<MessagePort, "close">;

export function createDetachedPortPair(): readonly [MessagingPort, MessagingPort] | [] {
  if (typeof MessageChannel === "undefined") {
    return [];
  }

  const channel = new MessageChannel();

  return [channel.port1, channel.port2];
}
