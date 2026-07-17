<script setup vapor lang="ts">
import {
  normalizeClass,
  normalizeStyle,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  useAttrs,
  watch,
  watchEffect,
} from "vue";

import { useSlotTrigger } from "./useSlotTrigger";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    elementCallback?: (element: HTMLElement | null) => void;
    omitAttributes?: readonly string[];
  }>(),
  { elementCallback: undefined, omitAttributes: () => [] },
);
const attrs = useAttrs();
const host = ref<HTMLElement | null>(null);
const element = useSlotTrigger(host, {});

let boundElement: HTMLElement | null = null;
let originalAttributes = new Map<string, string | null>();
let removeListeners: (() => void) | undefined;
let restoreHostProxy: (() => void) | undefined;

const exposed = {
  get $el(): HTMLElement | null {
    return element.value;
  },
};

defineExpose(exposed);

function eventName(attribute: string): string | null {
  return /^on[A-Z]/.test(attribute) ? attribute.slice(2).toLowerCase() : null;
}

function handlers(value: unknown): Array<(event: Event) => void> {
  if (typeof value === "function") return [value as (event: Event) => void];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is (event: Event) => void => typeof entry === "function");
}

function restore(): void {
  removeListeners?.();
  removeListeners = undefined;
  if (!boundElement) return;

  for (const [name, value] of originalAttributes) {
    if (value === null) boundElement.removeAttribute(name);
    else boundElement.setAttribute(name, value);
  }

  boundElement = null;
  originalAttributes = new Map();
}

function syncHostProxy(): void {
  const wrapper = host.value;
  if (!wrapper || restoreHostProxy) return;

  const originalFocus = wrapper.focus.bind(wrapper);
  const originalGetBoundingClientRect = wrapper.getBoundingClientRect.bind(wrapper);
  wrapper.focus = (options?: FocusOptions) => element.value?.focus(options);
  wrapper.getBoundingClientRect = () =>
    element.value?.getBoundingClientRect() ?? originalGetBoundingClientRect();
  restoreHostProxy = () => {
    wrapper.focus = originalFocus;
    wrapper.getBoundingClientRect = originalGetBoundingClientRect;
  };
}

function rememberAttribute(element: HTMLElement, name: string): void {
  if (!originalAttributes.has(name)) {
    originalAttributes.set(name, element.getAttribute(name));
  }
}

function applyStyle(element: HTMLElement, value: unknown): void {
  rememberAttribute(element, "style");
  const original = originalAttributes.get("style");
  element.style.cssText = original ?? "";

  const normalized = normalizeStyle(value);
  if (typeof normalized === "string") {
    element.style.cssText += `${element.style.cssText ? ";" : ""}${normalized}`;
    return;
  }

  for (const [name, entry] of Object.entries(normalized ?? {})) {
    if (entry === null || entry === undefined) continue;
    if (name.startsWith("--") || name.includes("-")) {
      element.style.setProperty(name, String(entry));
    } else {
      (element.style as unknown as Record<string, string>)[name] = String(entry);
    }
  }
}

function applyAttribute(element: HTMLElement, name: string, value: unknown): void {
  if (name === "class") {
    rememberAttribute(element, "class");
    const original = originalAttributes.get("class") ?? "";
    const forwarded = normalizeClass(value);
    element.setAttribute("class", [original, forwarded].filter(Boolean).join(" "));
    return;
  }
  if (name === "style") {
    applyStyle(element, value);
    return;
  }

  rememberAttribute(element, name);
  if (typeof value === "boolean" && name.startsWith("aria-")) {
    element.setAttribute(name, String(value));
  } else if (value === false || value === null || value === undefined) {
    element.removeAttribute(name);
  } else if (value === true || value === "") {
    element.setAttribute(name, "");
  } else {
    element.setAttribute(name, String(value));
  }
}

function sync(): void {
  syncHostProxy();
  const nextElement = element.value;
  if (nextElement !== boundElement) {
    restore();
    boundElement = nextElement;
  }
  if (!nextElement) return;

  removeListeners?.();
  const listenerCleanups: Array<() => void> = [];

  for (const [name, value] of Object.entries(attrs)) {
    const event = eventName(name);
    if (!event) {
      if (props.omitAttributes.includes(name)) {
        rememberAttribute(nextElement, name);
        nextElement.removeAttribute(name);
        continue;
      }
      applyAttribute(nextElement, name, value);
      continue;
    }

    for (const handler of handlers(value)) {
      nextElement.addEventListener(event, handler);
      listenerCleanups.push(() => nextElement.removeEventListener(event, handler));
    }
  }

  removeListeners = () => {
    for (const cleanup of listenerCleanups) cleanup();
  };
}

function forwardFocus(): void {
  element.value?.focus({ preventScroll: true });
}

onMounted(sync);
onUpdated(sync);
watchEffect(sync, { flush: "post" });
watch(element, (nextElement) => props.elementCallback?.(nextElement), {
  flush: "post",
  immediate: true,
});
onBeforeUnmount(() => {
  props.elementCallback?.(null);
  restore();
  restoreHostProxy?.();
});
</script>

<template>
  <span ref="host" class="ds-menu-primitive-slot" tabindex="-1" @focus="forwardFocus">
    <slot />
  </span>
</template>

<style scoped lang="scss">
.ds-menu-primitive-slot {
  display: contents;
}
</style>
