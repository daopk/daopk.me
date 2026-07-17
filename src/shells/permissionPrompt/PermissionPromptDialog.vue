<script setup vapor lang="ts">
import { computed, onBeforeUnmount, useId } from "vue";

import { Button, Modal } from "~/components/ui";
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
  { label: string; variant: "solid" | "surface"; color?: "blue"; onClick: () => void }
> = {
  deny: { label: "Don't allow", variant: "surface", onClick: onDeny },
  allowOnce: { label: "Allow once", variant: "surface", onClick: onAllowOnce },
  allowRemember: {
    label: "Allow and remember",
    variant: "solid",
    color: "blue",
    onClick: onAllowRemember,
  },
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

const SYSTEM_DIALOG_CONTENT_BASE_Z_INDEX = 1801;
const modalId = `permission-prompt-${useId()}`;
const modalFocusTrapOptions = {
  tabbableOptions: { displayCheck: "none" as const },
};
const modalSize = computed(() => (props.variant === "sheet" ? "100%" : "420px"));
const modalOverlayProps = computed(() => ({
  color:
    props.variant === "sheet"
      ? "color-mix(in oklab, var(--color-bg) 35%, transparent)"
      : "color-mix(in oklab, var(--color-bg) 60%, transparent)",
}));
const modalStyles = computed(() =>
  props.variant === "sheet"
    ? {
        root: {
          alignItems: "end",
          overflow: "hidden",
          padding: "0",
        },
        panel: {
          borderBlockEnd: "0",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          maxHeight: "calc(100% - var(--space-lg))",
        },
        footer: {
          paddingBlockEnd: "calc(var(--space-lg) + max(0px, env(safe-area-inset-bottom, 0px)))",
        },
      }
    : undefined,
);
const modalClassNames = computed(() => ({
  root: [
    "ds-permission-prompt__modal",
    `ds-permission-prompt__modal--${props.variant}`,
    "ds-permission-prompt__modal--system",
  ],
  overlay: ["ds-permission-prompt__overlay", "ds-permission-prompt__overlay--system"],
  panel: [
    "ds-permission-prompt__panel",
    `ds-permission-prompt__panel--${props.variant}`,
    "ds-permission-prompt__panel--system",
  ],
  footer: "ds-permission-prompt__footer",
}));

onBeforeUnmount(() => {
  const portalRoot = document.getElementById(modalId)?.parentElement;
  queueMicrotask(() => portalRoot?.remove());
});
</script>

<template>
  <div class="ds-permission-prompt__host">
    <Modal
      :id="modalId"
      :open="isOpen"
      :title="headline"
      :description="description"
      :size="modalSize"
      :base-z-index="SYSTEM_DIALOG_CONTENT_BASE_Z_INDEX"
      :close-on-overlay-click="false"
      :close-on-escape="false"
      :show-close-button="false"
      :focus-trap-options="modalFocusTrapOptions"
      :overlay-props="modalOverlayProps"
      :class-names="modalClassNames"
      :styles="modalStyles"
    >
      <template #footer>
        <div
          class="ds-permission-prompt__actions"
          :class="`ds-permission-prompt__actions--${resolvedLayout}`"
        >
          <Button
            v-for="action in actions"
            :key="action.id"
            :variant="action.variant"
            :color="action.color"
            @click="action.onClick"
          >
            {{ action.label }}
          </Button>
        </div>
      </template>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
.ds-permission-prompt__host {
  display: contents;
}

.ds-permission-prompt__actions {
  display: flex;
  gap: var(--space-sm);
  inline-size: 100%;
}

.ds-permission-prompt__actions--row {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ds-permission-prompt__actions--column {
  flex-direction: column;

  > :deep(*) {
    justify-content: center;
    inline-size: 100%;
  }
}
</style>
