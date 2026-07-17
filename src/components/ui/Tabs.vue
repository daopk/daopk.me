<script setup vapor lang="ts">
import { RopavTabs } from "./ropavAdapter";
import type {
  TabsActivationMode,
  TabsOrientation,
  TabsPlacement,
  TabsSize,
  TabsTriggerAlign,
  TabsValue,
  TabsVariant,
} from "./tabsTypes";

defineOptions({ inheritAttrs: false });

interface TabsProps {
  modelValue?: TabsValue | null;
  defaultValue?: TabsValue | null;
  id?: string;
  size?: TabsSize;
  variant?: TabsVariant;
  orientation?: TabsOrientation;
  placement?: TabsPlacement;
  align?: TabsTriggerAlign;
  activationMode?: TabsActivationMode;
  disabled?: boolean;
  unmountOnExit?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
}

withDefaults(defineProps<TabsProps>(), {
  modelValue: undefined,
  defaultValue: undefined,
  id: undefined,
  size: "md",
  variant: "pills",
  orientation: "horizontal",
  placement: "left",
  align: undefined,
  activationMode: "automatic",
  disabled: false,
  unmountOnExit: false,
  ariaLabel: undefined,
  ariaLabelledby: undefined,
  ariaDescribedby: undefined,
});

defineEmits<{
  "update:modelValue": [next: TabsValue];
}>();
</script>

<template>
  <RopavTabs
    v-bind="$attrs"
    class="ds-tabs"
    :id="id"
    :model-value="modelValue"
    :default-value="defaultValue"
    :size="size"
    :variant="variant"
    :orientation="orientation"
    :placement="placement"
    :align="align"
    :activation-mode="activationMode"
    :disabled="disabled"
    :unmount-on-exit="unmountOnExit"
    :aria-label="ariaLabel"
    :labelledby="ariaLabelledby"
    :describedby="ariaDescribedby"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <slot />
  </RopavTabs>
</template>

<style scoped lang="scss">
.ds-tabs {
  min-block-size: 0;
  min-inline-size: 0;
}
</style>
