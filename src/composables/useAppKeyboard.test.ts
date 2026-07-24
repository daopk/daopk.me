import { afterEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent } from "vue";

import { mountVaporTest as mount } from "~/test/mountVapor";
import { AppContextInjectionKey, type AppContext } from "~/types/app";

import {
  AppKeyboardScopeInjectionKey,
  useAppKeyboard,
  type AppKeyboardHandler,
  type UseAppKeyboardOptions,
} from "./useAppKeyboard";

function mountKeyboardHarness(
  handler: AppKeyboardHandler,
  options: UseAppKeyboardOptions = {},
  isActive: () => boolean = () => true,
  ownsEvent?: (event: KeyboardEvent) => boolean,
) {
  const Harness = defineVaporComponent(() => {
    const root = document.createElement("div");
    root.className = "keyboard-harness";
    root.innerHTML = `
      <button type="button">Action</button>
      <input aria-label="Input" />
      <textarea aria-label="Textarea"></textarea>
      <select aria-label="Select"><option>One</option></select>
      <div class="editable" contenteditable="true"><span>Editable</span></div>
    `;
    useAppKeyboard(handler, options);
    return root;
  });
  const context: AppContext = Object.freeze({
    args: Object.freeze({}),
    handleId: "keyboard-harness",
    isActive,
    manifestId: "keyboard-harness",
  });

  return mount(Harness, {
    global: {
      provide: {
        [AppContextInjectionKey as symbol]: context,
        ...(ownsEvent === undefined
          ? {}
          : {
              [AppKeyboardScopeInjectionKey as symbol]: Object.freeze({ ownsEvent }),
            }),
      },
    },
  });
}

function dispatchKey(
  target: EventTarget,
  init: KeyboardEventInit & { readonly composing?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "ArrowRight",
    ...init,
  });
  if (init.composing === true) {
    Object.defineProperty(event, "isComposing", { configurable: true, value: true });
  }
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useAppKeyboard", () => {
  it("routes keys only while the owning app is active and enabled", () => {
    let active = false;
    let enabled = true;
    const handler = vi.fn(() => false);
    const wrapper = mountKeyboardHarness(handler, { enabled: () => enabled }, () => active);
    const button = wrapper.get("button").element;

    dispatchKey(button);
    expect(handler).not.toHaveBeenCalled();

    active = true;
    enabled = false;
    dispatchKey(button);
    expect(handler).not.toHaveBeenCalled();

    enabled = true;
    dispatchKey(button);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("leaves events rejected by the host ownership callback untouched", () => {
    const handler = vi.fn(() => true);
    const ownsEvent = vi.fn(() => false);
    mountKeyboardHarness(handler, {}, () => true, ownsEvent);
    const shellButton = document.createElement("button");
    const shellListener = vi.fn();
    shellButton.addEventListener("keydown", shellListener);
    document.body.append(shellButton);

    const event = dispatchKey(shellButton);

    expect(ownsEvent).toHaveBeenCalledWith(event);
    expect(handler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(shellListener).toHaveBeenCalledWith(event);
  });

  it("routes window, document, and body events accepted by the host", () => {
    const handler = vi.fn(() => true);
    const ownsEvent = vi.fn(() => true);
    mountKeyboardHarness(handler, {}, () => true, ownsEvent);

    const windowEvent = dispatchKey(window);
    const documentEvent = dispatchKey(document);
    const bodyEvent = dispatchKey(document.body);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(1, windowEvent);
    expect(handler).toHaveBeenNthCalledWith(2, documentEvent);
    expect(handler).toHaveBeenNthCalledWith(3, bodyEvent);
    expect(ownsEvent).toHaveBeenCalledTimes(3);
    expect(windowEvent.defaultPrevented).toBe(true);
    expect(documentEvent.defaultPrevented).toBe(true);
    expect(bodyEvent.defaultPrevented).toBe(true);
  });

  it("treats a missing host ownership scope as legacy-compatible", () => {
    const handler = vi.fn(() => true);
    mountKeyboardHarness(handler);
    const legacyTarget = document.createElement("button");
    document.body.append(legacyTarget);

    const event = dispatchKey(legacyTarget);

    expect(handler).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores events that are already prevented or part of IME composition", () => {
    const handler = vi.fn(() => false);
    const wrapper = mountKeyboardHarness(handler);
    const button = wrapper.get("button").element;
    const prevented = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    });
    prevented.preventDefault();

    button.dispatchEvent(prevented);
    dispatchKey(button, { composing: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores editable targets by default", () => {
    const handler = vi.fn(() => false);
    const wrapper = mountKeyboardHarness(handler);

    dispatchKey(wrapper.get("input").element);
    dispatchKey(wrapper.get("textarea").element);
    dispatchKey(wrapper.get("select").element);
    dispatchKey(wrapper.get(".editable span").element);

    expect(handler).not.toHaveBeenCalled();
  });

  it("can include editable targets and key-repeat events", () => {
    const handler = vi.fn((_event: KeyboardEvent) => false);
    const wrapper = mountKeyboardHarness(handler, { includeEditableTargets: true });

    dispatchKey(wrapper.get("input").element, { repeat: true });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0].repeat).toBe(true);
  });

  it("consumes handled events before they reach the focused element", () => {
    const handler = vi.fn(() => true);
    const wrapper = mountKeyboardHarness(handler);
    const button = wrapper.get("button").element;
    const targetListener = vi.fn();
    button.addEventListener("keydown", targetListener);

    const event = dispatchKey(button);

    expect(handler).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(true);
    expect(targetListener).not.toHaveBeenCalled();
  });

  it("leaves unhandled events untouched", () => {
    const handler = vi.fn(() => false);
    const wrapper = mountKeyboardHarness(handler);
    const button = wrapper.get("button").element;
    const targetListener = vi.fn();
    button.addEventListener("keydown", targetListener);

    const event = dispatchKey(button);

    expect(event.defaultPrevented).toBe(false);
    expect(targetListener).toHaveBeenCalledWith(event);
  });

  it("removes the same capture listener when the app unmounts", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const wrapper = mountKeyboardHarness(vi.fn(() => false));
    const captureListener = addEventListener.mock.calls.find(
      ([type, , options]) =>
        type === "keydown" &&
        typeof options === "object" &&
        options !== null &&
        options.capture === true,
    )?.[1];

    expect(captureListener).toBeTypeOf("function");
    wrapper.unmount();

    expect(removeEventListener).toHaveBeenCalledWith("keydown", captureListener, {
      capture: true,
    });
  });
});
