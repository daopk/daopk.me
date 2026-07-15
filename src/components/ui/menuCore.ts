import { inject, onBeforeUnmount, provide, watch, type InjectionKey, type Ref } from "vue";

export const MENU_ITEM_SELECTOR =
  '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
export const MENU_SELECT_EVENT = "ds-menu-select";
export const MENU_RADIO_SELECT_EVENT = "ds-menu-radio-select";

interface MenuContext {
  readonly contentId: string;
}

interface MenuSelectDetail {
  readonly selectEvent: Event;
}

interface MenuRadioSelectDetail {
  readonly value: string;
}

interface MenuSurfaceOptions {
  readonly close: (restoreFocus: boolean) => void;
  readonly content: Readonly<Ref<HTMLElement | null>>;
  readonly modal: () => boolean;
  readonly open: () => boolean;
  readonly trigger: Readonly<Ref<HTMLElement | null>>;
}

interface AttributeSnapshot {
  readonly ariaControls: string | null;
  readonly ariaExpanded: string | null;
  readonly ariaHaspopup: string | null;
  readonly dataState: string | null;
}

const menuContextKey: InjectionKey<MenuContext> = Symbol("ds-menu-context");

export function provideMenuContext(context: MenuContext): void {
  provide(menuContextKey, context);
}

export function useMenuContext(): MenuContext | null {
  return inject(menuContextKey, null);
}

export function dispatchMenuSelect(element: HTMLElement, selectEvent: Event): void {
  element.dispatchEvent(
    new CustomEvent<MenuSelectDetail>(MENU_SELECT_EVENT, {
      bubbles: true,
      detail: { selectEvent },
    }),
  );
}

export function dispatchMenuRadioSelect(element: HTMLElement, value: string): void {
  element.dispatchEvent(
    new CustomEvent<MenuRadioSelectDetail>(MENU_RADIO_SELECT_EVENT, {
      bubbles: true,
      detail: { value },
    }),
  );
}

export function menuItems(content: HTMLElement | null): HTMLElement[] {
  if (!content) return [];
  return Array.from(content.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
    (item) => !item.hasAttribute("data-disabled") && item.getAttribute("aria-disabled") !== "true",
  );
}

function setHighlighted(content: HTMLElement, item: HTMLElement): void {
  for (const candidate of content.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)) {
    const highlighted = candidate === item;
    candidate.tabIndex = highlighted ? 0 : -1;
    candidate.toggleAttribute("data-highlighted", highlighted);
  }
}

export function focusMenuEdge(content: HTMLElement | null, edge: "first" | "last"): void {
  const items = menuItems(content);
  const target = edge === "first" ? items[0] : items.at(-1);
  if (!target || !content) {
    content?.focus({ preventScroll: true });
    return;
  }
  setHighlighted(content, target);
  target.focus({ preventScroll: true });
}

export function useMenuTriggerAria(
  trigger: Readonly<Ref<HTMLElement | null>>,
  open: () => boolean,
  contentId: string,
  disclosure = true,
): void {
  let boundElement: HTMLElement | null = null;
  let snapshot: AttributeSnapshot | null = null;

  function restore(): void {
    if (!boundElement || !snapshot) return;
    const restoreAttribute = (name: string, value: string | null) => {
      if (value === null) boundElement?.removeAttribute(name);
      else boundElement?.setAttribute(name, value);
    };
    restoreAttribute("aria-controls", snapshot.ariaControls);
    restoreAttribute("aria-expanded", snapshot.ariaExpanded);
    restoreAttribute("aria-haspopup", snapshot.ariaHaspopup);
    restoreAttribute("data-state", snapshot.dataState);
    boundElement = null;
    snapshot = null;
  }

  watch(
    [trigger, open],
    ([element, isOpen]) => {
      if (element !== boundElement) {
        restore();
        if (element) {
          boundElement = element;
          snapshot = {
            ariaControls: element.getAttribute("aria-controls"),
            ariaExpanded: element.getAttribute("aria-expanded"),
            ariaHaspopup: element.getAttribute("aria-haspopup"),
            dataState: element.getAttribute("data-state"),
          };
        }
      }
      if (!element) return;
      element.setAttribute("aria-haspopup", "menu");
      element.dataset.state = isOpen ? "open" : "closed";
      if (disclosure) {
        element.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) element.setAttribute("aria-controls", contentId);
        else element.removeAttribute("aria-controls");
      } else {
        element.removeAttribute("aria-expanded");
        element.removeAttribute("aria-controls");
      }
    },
    { flush: "post", immediate: true },
  );

  onBeforeUnmount(restore);
}

function itemFromEvent(content: HTMLElement, event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const item = target.closest<HTMLElement>(MENU_ITEM_SELECTOR);
  return item && content.contains(item) ? item : null;
}

/** Item navigation retained by the facade; Ropav owns disclosure and positioning. */
export function useMenuSurface(options: MenuSurfaceOptions) {
  let typeahead = "";
  let typeaheadTimer: number | undefined;

  function clearTypeahead(): void {
    if (typeaheadTimer !== undefined) window.clearTimeout(typeaheadTimer);
    typeaheadTimer = undefined;
    typeahead = "";
  }

  function moveFocus(direction: 1 | -1): void {
    const content = options.content.value;
    const items = menuItems(content);
    if (!content || items.length === 0) return;
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const index = items.indexOf(current!);
    const nextIndex = index === -1 ? (direction === 1 ? 0 : items.length - 1) : index + direction;
    const target = items[(nextIndex + items.length) % items.length]!;
    setHighlighted(content, target);
    target.focus({ preventScroll: true });
  }

  function runTypeahead(key: string): void {
    const content = options.content.value;
    const items = menuItems(content);
    if (!content || items.length === 0) return;

    typeahead += key.toLocaleLowerCase();
    if (new Set(typeahead).size === 1) typeahead = key.toLocaleLowerCase();
    if (typeaheadTimer !== undefined) window.clearTimeout(typeaheadTimer);
    typeaheadTimer = window.setTimeout(clearTypeahead, 700);

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const ordered = [...items.slice(currentIndex + 1), ...items.slice(0, currentIndex + 1)];
    const target = ordered.find((item) => {
      const value = item.dataset.textValue ?? item.textContent ?? "";
      return value.trim().toLocaleLowerCase().startsWith(typeahead);
    });
    if (!target) return;
    setHighlighted(content, target);
    target.focus({ preventScroll: true });
  }

  function onKeydown(event: KeyboardEvent): void {
    const content = options.content.value;
    if (!content) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusMenuEdge(content, event.key === "Home" ? "first" : "last");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const item = itemFromEvent(content, event);
      if (item) {
        event.preventDefault();
        item.click();
      }
      return;
    }
    if (event.key === "Tab") {
      options.close(false);
      return;
    }
    if (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      runTypeahead(event.key);
    }
  }

  function onFocusin(event: FocusEvent): void {
    const content = options.content.value;
    if (!content) return;
    const item = itemFromEvent(content, event);
    if (item) setHighlighted(content, item);
  }

  function onPointermove(event: PointerEvent): void {
    const content = options.content.value;
    if (!content) return;
    const item = itemFromEvent(content, event);
    if (item && !item.hasAttribute("data-disabled")) setHighlighted(content, item);
  }

  function onSelect(): void {
    options.close(true);
  }

  function onDocumentPointerdown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (options.content.value?.contains(target) || options.trigger.value?.contains(target)) return;
    if (options.modal() && event.cancelable) event.preventDefault();
    options.close(false);
  }

  watch(
    options.open,
    (open) => {
      document.removeEventListener("pointerdown", onDocumentPointerdown, true);
      if (open) document.addEventListener("pointerdown", onDocumentPointerdown, true);
      else clearTypeahead();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    clearTypeahead();
    document.removeEventListener("pointerdown", onDocumentPointerdown, true);
  });

  return { onFocusin, onKeydown, onPointermove, onSelect };
}
