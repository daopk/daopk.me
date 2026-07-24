import { afterEach, describe, expect, it, vi } from "vitest";
import { defineVaporComponent } from "vue";

import { AppContextInjectionKey } from "@daopk/sdk";
import { mountVaporTest as mount } from "~/test/mountVapor";

import {
  useMoviesAppKeyboard,
  type MoviesAppKeyboardHandler,
  type UseMoviesAppKeyboardOptions,
} from "./useMoviesAppKeyboard";

const legacySdk = vi.hoisted(() => ({
  AppContextInjectionKey: Symbol("LegacyAppContext"),
}));

// Deliberately expose only the long-lived runtime key. If this compatibility
// module starts statically importing a newer host export, the test module must
// fail to instantiate instead of silently validating against the current SDK.
vi.mock("@daopk/sdk", () => legacySdk);

interface KeyboardHarnessContext {
  readonly args: Readonly<Record<string, unknown>>;
  readonly handleId: string;
  readonly isActive?: () => boolean;
  readonly manifestId: string;
}

function mountKeyboardHarness(
  context: KeyboardHarnessContext,
  handler: MoviesAppKeyboardHandler,
  options: UseMoviesAppKeyboardOptions = {},
) {
  const Harness = defineVaporComponent(() => {
    const root = document.createElement("section");
    root.className = "movies-keyboard-harness";
    root.innerHTML = `
      <button type="button">Action</button>
      <input aria-label="Input" />
      <div class="editable" contenteditable="true"><span>Editable</span></div>
    `;
    useMoviesAppKeyboard(() => root, handler, options);
    return root;
  });

  return mount(Harness, {
    global: {
      provide: {
        [AppContextInjectionKey as symbol]: Object.freeze(context),
      },
    },
  });
}

function makeContext(isActive?: () => boolean): KeyboardHarnessContext {
  return {
    args: Object.freeze({}),
    handleId: "movies-keyboard-test",
    ...(isActive === undefined ? {} : { isActive }),
    manifestId: "movies",
  };
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

describe("useMoviesAppKeyboard", () => {
  it("treats an old-host app context without isActive as active", () => {
    const handler = vi.fn(() => true);
    const wrapper = mountKeyboardHarness(makeContext(), handler);
    const button = wrapper.get("button").element;
    const targetListener = vi.fn();
    button.addEventListener("keydown", targetListener);

    const event = dispatchKey(button, { repeat: true });

    expect(handler).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(true);
    expect(targetListener).not.toHaveBeenCalled();
  });

  it("routes only while a current-host app context is active and enabled", () => {
    let active = false;
    let enabled = true;
    const handler = vi.fn(() => false);
    const wrapper = mountKeyboardHarness(
      makeContext(() => active),
      handler,
      {
        enabled: () => enabled,
      },
    );
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

  it("leaves events from external shell targets untouched", () => {
    const handler = vi.fn(() => true);
    mountKeyboardHarness(makeContext(), handler);
    const shellInput = document.createElement("input");
    const shellListener = vi.fn();
    shellInput.addEventListener("keydown", shellListener);
    document.body.append(shellInput);

    const event = dispatchKey(shellInput);

    expect(handler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(shellListener).toHaveBeenCalledWith(event);
  });

  it("accepts window, document, and body as focus-fallback targets for a connected root", () => {
    const handler = vi.fn(() => true);
    mountKeyboardHarness(makeContext(), handler);

    const windowEvent = dispatchKey(window);
    const documentEvent = dispatchKey(document);
    const bodyEvent = dispatchKey(document.body);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(1, windowEvent);
    expect(handler).toHaveBeenNthCalledWith(2, documentEvent);
    expect(handler).toHaveBeenNthCalledWith(3, bodyEvent);
    expect(windowEvent.defaultPrevented).toBe(true);
    expect(documentEvent.defaultPrevented).toBe(true);
    expect(bodyEvent.defaultPrevented).toBe(true);
  });

  it("ignores prevented, composing, and editable-target events by default", () => {
    const handler = vi.fn(() => false);
    const wrapper = mountKeyboardHarness(makeContext(), handler);
    const button = wrapper.get("button").element;
    const prevented = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    });
    prevented.preventDefault();

    button.dispatchEvent(prevented);
    dispatchKey(button, { composing: true });
    dispatchKey(wrapper.get("input").element);
    dispatchKey(wrapper.get(".editable span").element);

    expect(handler).not.toHaveBeenCalled();
  });

  it("can include editable targets", () => {
    const handler = vi.fn(() => false);
    const wrapper = mountKeyboardHarness(makeContext(), handler, {
      includeEditableTargets: true,
    });
    const input = wrapper.get("input").element;

    dispatchKey(input);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("removes the same capture listener when the app unmounts", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const wrapper = mountKeyboardHarness(
      makeContext(),
      vi.fn(() => false),
    );
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
