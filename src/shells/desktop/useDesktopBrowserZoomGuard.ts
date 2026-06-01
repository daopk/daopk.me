import { onUnmounted, watch, type Ref } from "vue";

const GESTURE_EVENTS = ["gesturestart", "gesturechange", "gestureend"] as const;
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: false };

export interface DesktopBrowserZoomGuardHandle {
  dispose(): void;
}

/**
 * Prevents desktop trackpad pinch gestures from zooming the whole shell while
 * still allowing child apps to observe the same events.
 */
export function useDesktopBrowserZoomGuard(
  target: Ref<HTMLElement | null | undefined>,
): DesktopBrowserZoomGuardHandle {
  let attachedEl: HTMLElement | undefined;

  function onWheel(event: WheelEvent): void {
    if (event.ctrlKey) {
      event.preventDefault();
    }
  }

  function onGesture(event: Event): void {
    event.preventDefault();
  }

  function attach(el: HTMLElement): void {
    attachedEl = el;
    el.addEventListener("wheel", onWheel, LISTENER_OPTIONS);
    for (const type of GESTURE_EVENTS) {
      el.addEventListener(type, onGesture, LISTENER_OPTIONS);
    }
  }

  function detach(): void {
    if (attachedEl === undefined) {
      return;
    }
    attachedEl.removeEventListener("wheel", onWheel, LISTENER_OPTIONS);
    for (const type of GESTURE_EVENTS) {
      attachedEl.removeEventListener(type, onGesture, LISTENER_OPTIONS);
    }
    attachedEl = undefined;
  }

  const stopWatch = watch(
    target,
    (el, _prev, onCleanup) => {
      detach();
      if (el) {
        attach(el);
      }
      onCleanup(() => {
        detach();
      });
    },
    { immediate: true, flush: "post" },
  );

  function dispose(): void {
    stopWatch();
    detach();
  }

  onUnmounted(dispose);

  return { dispose };
}
