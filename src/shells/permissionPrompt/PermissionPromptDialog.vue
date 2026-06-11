<script setup lang="ts">
import { computed } from "vue";

import { Button, Dialog } from "~/components/ui";
import { usePermissionPromptQueue } from "~/composables/usePermissionPromptQueue";
import { permissionLabel } from "~/core/permissions/copy";

type PermissionActionId = "deny" | "allowOnce" | "allowRemember";

interface PermissionPromptDialogProps {
  /** `modal` for desktop, `sheet` for mobile. */
  variant: "modal" | "sheet";
  /** Action arrangement; defaults to a row for `modal` and a column for `sheet`. */
  layout?: "row" | "column";
  /** Visual order of the action buttons; defaults to the variant's convention. */
  actionOrder?: readonly PermissionActionId[];
}

const props = defineProps<PermissionPromptDialogProps>();

const queue = usePermissionPromptQueue();

const isOpen = computed(() => queue.current.value !== null);

const headline = computed(() => {
  const vm = queue.current.value;
  if (!vm) return "";
  const appName = vm.manifest?.name ?? vm.request.manifestId;
  return `${appName} wants to ${permissionLabel(vm.request.permission)}.`;
});

const description = computed(() => {
  const vm = queue.current.value;
  if (!vm) return undefined;
  if (queue.pendingCount.value > 1) {
    const remaining = queue.pendingCount.value - 1;
    return `You can change this later in Settings → Privacy. ${remaining} more pending.`;
  }
  return "You can change this later in Settings → Privacy.";
});

function onAllowOnce(): void {
  queue.respond({ granted: true, persist: false });
}

function onAllowRemember(): void {
  queue.respond({ granted: true, persist: true });
}

function onDeny(): void {
  queue.respond({ granted: false, persist: true });
}

const actionConfig: Record<
  PermissionActionId,
  { label: string; variant: "primary" | "secondary"; onClick: () => void }
> = {
  deny: { label: "Don't allow", variant: "secondary", onClick: onDeny },
  allowOnce: { label: "Allow once", variant: "secondary", onClick: onAllowOnce },
  allowRemember: { label: "Allow and remember", variant: "primary", onClick: onAllowRemember },
};

const resolvedLayout = computed(
  () => props.layout ?? (props.variant === "sheet" ? "column" : "row"),
);

const resolvedOrder = computed<readonly PermissionActionId[]>(
  () =>
    props.actionOrder ??
    (props.variant === "sheet"
      ? ["allowRemember", "allowOnce", "deny"]
      : ["deny", "allowOnce", "allowRemember"]),
);

const actions = computed(() => resolvedOrder.value.map((id) => ({ id, ...actionConfig[id] })));
</script>

<template>
  <Dialog
    :open="isOpen"
    :title="headline"
    :description="description"
    :variant="variant"
    layer="system"
    :dismissible="false"
  >
    <div
      class="ds-permission-prompt__actions"
      :class="`ds-permission-prompt__actions--${resolvedLayout}`"
    >
      <Button
        v-for="action in actions"
        :key="action.id"
        :variant="action.variant"
        @click="action.onClick"
      >
        {{ action.label }}
      </Button>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.ds-permission-prompt__actions {
  display: flex;
  gap: var(--space-sm);
  margin-block-start: var(--space-md);
}

.ds-permission-prompt__actions--row {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ds-permission-prompt__actions--column {
  flex-direction: column;

  :deep(.ds-button) {
    justify-content: center;
    inline-size: 100%;
  }
}
</style>
