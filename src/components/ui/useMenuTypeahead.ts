import { onBeforeUnmount } from "vue";

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

function menuItems(content: HTMLElement): HTMLElement[] {
  return Array.from(content.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
    (item) =>
      item.closest('[role="menu"]') === content &&
      !item.hasAttribute("data-disabled") &&
      item.getAttribute("aria-disabled") !== "true",
  );
}

function itemText(item: HTMLElement): string {
  return (item.dataset.textValue ?? item.textContent ?? "").trim().toLocaleLowerCase();
}

export function useMenuTypeahead() {
  let buffer = "";
  let timer: number | undefined;

  function clear(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    buffer = "";
  }

  function onKeydown(event: KeyboardEvent): void {
    if (
      event.key.length !== 1 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing
    ) {
      return;
    }

    const content = event.currentTarget;
    if (!(content instanceof HTMLElement)) return;
    const items = menuItems(content);
    if (items.length === 0) return;

    event.preventDefault();
    buffer += event.key.toLocaleLowerCase();
    if (new Set(buffer).size === 1) buffer = event.key.toLocaleLowerCase();
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(clear, 700);

    const activeId = content.getAttribute("aria-activedescendant");
    const activeIndex = items.findIndex((item) => item.id === activeId);
    const ordered = [...items.slice(activeIndex + 1), ...items.slice(0, activeIndex + 1)];
    const target = ordered.find((item) => itemText(item).startsWith(buffer));
    if (!target) return;

    const EventConstructor = target.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
    target.dispatchEvent(new EventConstructor("mouseenter", { cancelable: true }));
  }

  onBeforeUnmount(clear);
  return { onKeydown };
}
