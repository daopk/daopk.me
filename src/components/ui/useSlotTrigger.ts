import { onBeforeUnmount, onMounted, onUpdated, shallowRef, type Ref } from "vue";

type TriggerHandler = (event: Event) => void;

export function useSlotTrigger(
  host: Readonly<Ref<HTMLElement | null>>,
  handlers: Readonly<Record<string, TriggerHandler>>,
) {
  const element = shallowRef<HTMLElement | null>(null);
  let removeListeners: (() => void) | undefined;

  function sync(): void {
    const next = host.value?.firstElementChild;
    const nextElement = next instanceof HTMLElement ? next : null;
    if (nextElement === element.value) return;

    removeListeners?.();
    element.value = nextElement;
    if (!nextElement) {
      removeListeners = undefined;
      return;
    }

    for (const [event, handler] of Object.entries(handlers)) {
      nextElement.addEventListener(event, handler);
    }
    removeListeners = () => {
      for (const [event, handler] of Object.entries(handlers)) {
        nextElement.removeEventListener(event, handler);
      }
    };
  }

  onMounted(sync);
  onUpdated(sync);
  onBeforeUnmount(() => removeListeners?.());

  return element;
}

export function toggleAriaToken(
  element: HTMLElement | null,
  attribute: "aria-describedby" | "aria-controls",
  token: string,
  enabled: boolean,
): void {
  if (!element) return;
  const tokens = new Set((element.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean));
  if (enabled) tokens.add(token);
  else tokens.delete(token);

  if (tokens.size > 0) element.setAttribute(attribute, [...tokens].join(" "));
  else element.removeAttribute(attribute);
}
