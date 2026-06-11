import { fluentColorIconComponents } from "~/icons/fluentColor";

import type { Component } from "vue";

export type FirstPartyIconKey = keyof typeof fluentColorIconComponents;

export function isFirstPartyIconKey(key: string): key is FirstPartyIconKey {
  return Object.hasOwn(fluentColorIconComponents, key);
}

export function resolveFirstPartyIcon(key: FirstPartyIconKey): Component {
  return fluentColorIconComponents[key];
}
