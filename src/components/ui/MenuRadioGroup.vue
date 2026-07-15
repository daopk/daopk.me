<script setup vapor lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const root = ref<HTMLElement | null>(null);

let observer: MutationObserver | undefined;

function sync(): void {
  for (const item of root.value?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []) {
    const checked = item.dataset.menuValue === props.modelValue;
    item.setAttribute("aria-checked", String(checked));
    item.dataset.state = checked ? "checked" : "unchecked";
  }
}

function onRadioSelect(event: Event): void {
  const value = (event as CustomEvent<{ value: string }>).detail.value;
  emit("update:modelValue", value);
  void nextTick(sync);
}

watch(() => props.modelValue, sync, { flush: "post" });
onMounted(() => {
  sync();
  if (root.value) {
    observer = new MutationObserver(sync);
    observer.observe(root.value, { childList: true, subtree: true });
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="root" role="group" @ds-menu-radio-select="onRadioSelect"><slot /></div>
</template>
