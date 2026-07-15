<script setup vapor lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

import { dispatchMenuRadioSelect, dispatchMenuSelect, useMenuContext } from "./menuCore";
import { useSlotTrigger } from "./useSlotTrigger";

interface MenuRadioItemProps {
  asChild?: boolean;
  disabled?: boolean;
  textValue?: string;
  value: string;
}

const props = withDefaults(defineProps<MenuRadioItemProps>(), {
  asChild: false,
  disabled: false,
  textValue: undefined,
});
const emit = defineEmits<{ select: [event: Event] }>();
const menu = useMenuContext();
const host = ref<HTMLElement | null>(null);
const child = useSlotTrigger(host, { click: onChildClick });

let boundChild: HTMLElement | null = null;

function activate(element: HTMLElement): void {
  if (props.disabled) return;
  const selectEvent = new Event("select", { cancelable: true });
  emit("select", selectEvent);
  if (selectEvent.defaultPrevented) return;
  dispatchMenuRadioSelect(element, props.value);
  dispatchMenuSelect(element, selectEvent);
}

function onChildClick(): void {
  if (child.value) activate(child.value);
}

function onClick(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) activate(event.currentTarget);
}

function cleanupChild(): void {
  if (!boundChild) return;
  for (const attribute of [
    "aria-checked",
    "aria-disabled",
    "data-disabled",
    "data-menu-content",
    "data-menu-value",
    "data-state",
    "data-text-value",
    "role",
    "tabindex",
  ]) {
    boundChild.removeAttribute(attribute);
  }
  boundChild = null;
}

watch(
  [child, () => props.disabled, () => props.textValue, () => props.value, () => menu?.contentId],
  ([element]) => {
    if (element !== boundChild) {
      cleanupChild();
      boundChild = element;
    }
    if (!element) return;
    element.setAttribute("role", "menuitemradio");
    element.setAttribute("aria-checked", element.getAttribute("aria-checked") ?? "false");
    element.tabIndex = -1;
    element.dataset.menuValue = props.value;
    element.toggleAttribute("data-disabled", props.disabled);
    if (props.disabled) element.setAttribute("aria-disabled", "true");
    else element.removeAttribute("aria-disabled");
    if (props.textValue) element.dataset.textValue = props.textValue;
    else element.removeAttribute("data-text-value");
    if (menu) element.dataset.menuContent = menu.contentId;
  },
  { flush: "post", immediate: true },
);

onBeforeUnmount(cleanupChild);
</script>

<template>
  <span v-if="asChild" ref="host" class="ds-menu-item-host"><slot /></span>
  <div
    v-else
    role="menuitemradio"
    aria-checked="false"
    tabindex="-1"
    :aria-disabled="disabled ? 'true' : undefined"
    :data-disabled="disabled || undefined"
    :data-menu-content="menu?.contentId"
    :data-menu-value="value"
    :data-text-value="textValue"
    @click="onClick"
  >
    <slot />
  </div>
</template>
