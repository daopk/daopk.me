import { storeToRefs } from "pinia";
import { computed, type ComputedRef } from "vue";

import { useWidgetPlacementStore } from "~/core/widgets/WidgetPlacementStore";
import type { WidgetShellScope } from "~/types/widget";

export function useWidgetEnabled(scope: WidgetShellScope): {
  enabled: ComputedRef<Readonly<Record<string, boolean>>>;
  isEnabled: (id: string, defaultVisible?: boolean) => boolean;
  setEnabled: (id: string, value: boolean, defaultVisible?: boolean) => void;
} {
  const store = useWidgetPlacementStore();
  const { enabled } = storeToRefs(store);
  const scopedEnabled = computed(() => enabled.value[scope]);

  return {
    enabled: scopedEnabled,
    isEnabled: (id, defaultVisible) => store.isEnabled(scope, id, defaultVisible),
    setEnabled: (id, value, defaultVisible) => {
      store.setEnabled(scope, id, value, defaultVisible);
    },
  };
}
