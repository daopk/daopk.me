import { nextTick } from "vue";

export const ACTIVE_MODAL_DIALOG_SELECTOR = '.rp-modal:not(.rp-modal-leave-active) [role="dialog"]';

/** Return the interactive modal, excluding any previous panel retained for its leave transition. */
export function queryActiveModalDialog(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(ACTIVE_MODAL_DIALOG_SELECTOR);
}

/** Let an already-started modal leave finish before a test unmounts or clears its DOM root. */
export async function finishLeavingModals(root: ParentNode = document): Promise<void> {
  await nextTick();

  for (let frame = 0; frame < 3 && root.querySelector(".rp-modal-leave-active"); frame += 1) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  await nextTick();
}
