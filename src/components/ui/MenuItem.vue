<script setup vapor lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

import { dispatchMenuSelect, useMenuContext } from "./menuCore";
import { useSlotTrigger } from "./useSlotTrigger";

interface MenuItemProps {
  asChild?: boolean;
  disabled?: boolean;
  textValue?: string;
}

const props = withDefaults(defineProps<MenuItemProps>(), {
  asChild: false,
  disabled: false,
  textValue: undefined,
});

const emit = defineEmits<{ select: [event: Event] }>();
const menu = useMenuContext();
const host = ref<HTMLElement | null>(null);
const child = useSlotTrigger(host, { click: onChildClick });

let boundChild: HTMLElement | null = null;
let originalRole: string | null = null;
let originalTabindex: string | null = null;
let originalAriaDisabled: string | null = null;

function activate(element: HTMLElement): void {
  if (props.disabled) return;
  const selectEvent = new Event("select", { cancelable: true });
  emit("select", selectEvent);
  if (!selectEvent.defaultPrevented) dispatchMenuSelect(element, selectEvent);
}

function onChildClick(): void {
  if (child.value) activate(child.value);
}

function onClick(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) activate(event.currentTarget);
}

function restoreChild(): void {
  if (!boundChild) return;
  const restoreAttribute = (name: string, value: string | null) => {
    if (value === null) boundChild?.removeAttribute(name);
    else boundChild?.setAttribute(name, value);
  };
  restoreAttribute("role", originalRole);
  restoreAttribute("tabindex", originalTabindex);
  restoreAttribute("aria-disabled", originalAriaDisabled);
  boundChild.removeAttribute("data-disabled");
  boundChild.removeAttribute("data-menu-content");
  boundChild.removeAttribute("data-text-value");
  boundChild = null;
}

watch(
  [child, () => props.disabled, () => props.textValue, () => menu?.contentId],
  ([element]) => {
    if (element !== boundChild) {
      restoreChild();
      if (element) {
        boundChild = element;
        originalRole = element.getAttribute("role");
        originalTabindex = element.getAttribute("tabindex");
        originalAriaDisabled = element.getAttribute("aria-disabled");
      }
    }
    if (!element) return;
    element.setAttribute("role", "menuitem");
    element.tabIndex = -1;
    element.toggleAttribute("data-disabled", props.disabled);
    if (props.disabled) element.setAttribute("aria-disabled", "true");
    else element.removeAttribute("aria-disabled");
    if (props.textValue) element.dataset.textValue = props.textValue;
    else element.removeAttribute("data-text-value");
    if (menu) element.dataset.menuContent = menu.contentId;
  },
  { flush: "post", immediate: true },
);

onBeforeUnmount(restoreChild);
</script>

<template>
  <span v-if="asChild" ref="host" class="ds-menu-item-host"><slot /></span>
  <div
    v-else
    role="menuitem"
    tabindex="-1"
    :aria-disabled="disabled ? 'true' : undefined"
    :data-disabled="disabled || undefined"
    :data-menu-content="menu?.contentId"
    :data-text-value="textValue"
    @click="onClick"
  >
    <slot />
  </div>
</template>

<style lang="scss">
.ds-menu-item-host {
  display: contents;
}
</style>
