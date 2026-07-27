import { describe, expect, it, vi } from "vitest";
import { createComponent, defineVaporComponent, inject } from "vue";

import { AppKeyboardScopeInjectionKey, type AppKeyboardScope } from "~/composables/useAppKeyboard";
import { mountVaporTest as mount } from "~/test/mountVapor";
import { AppContextInjectionKey, type AppContext } from "~/types/app";

import {
  createConnectedRootKeyboardAdapter,
  denyAllKeyboardAdapter,
  provideHostedAppEnvironment,
} from "./hostedAppEnvironment";

function dispatchKey(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "ArrowRight",
  });
  target.dispatchEvent(event);
  return event;
}

describe("hosted-app environment", () => {
  it("provides immutable identity and args with live host policies", () => {
    let active = false;
    const args: Record<string, unknown> = { greeting: "hi" };
    const ownsEvent = vi.fn(() => true);
    const captured: {
      context: AppContext | null;
      keyboard: AppKeyboardScope | null;
    } = {
      context: null,
      keyboard: null,
    };

    const Consumer = defineVaporComponent(() => {
      captured.context = inject(AppContextInjectionKey, null);
      captured.keyboard = inject(AppKeyboardScopeInjectionKey, null);
      return document.createElement("div");
    });
    const Host = defineVaporComponent(() => {
      provideHostedAppEnvironment({
        manifestId: "notes",
        handleId: "notes-1",
        args,
        isActive: () => active,
        keyboard: { ownsEvent },
      });
      return createComponent(Consumer);
    });

    mount(Host);

    expect(captured.context).toEqual({
      manifestId: "notes",
      handleId: "notes-1",
      args: { greeting: "hi" },
      isActive: expect.any(Function),
    });
    expect(Object.isFrozen(captured.context)).toBe(true);
    expect(Object.isFrozen(captured.context?.args)).toBe(true);
    expect(Object.isFrozen(captured.keyboard)).toBe(true);

    args.greeting = "changed outside";
    active = true;
    const event = new KeyboardEvent("keydown");

    expect(captured.context?.args).toEqual({ greeting: "hi" });
    expect(captured.context?.isActive()).toBe(true);
    expect(captured.keyboard?.ownsEvent(event)).toBe(true);
    expect(ownsEvent).toHaveBeenCalledWith(event);
  });

  it("supports connected-root and deny-all keyboard adapters", () => {
    const root = document.createElement("div");
    const ownedTarget = document.createElement("button");
    const shellTarget = document.createElement("button");
    root.append(ownedTarget);
    document.body.append(root, shellTarget);

    const connectedRoot = createConnectedRootKeyboardAdapter(() => root);
    const ownedEvent = dispatchKey(ownedTarget);
    const shellEvent = dispatchKey(shellTarget);
    const windowEvent = dispatchKey(window);
    const documentEvent = dispatchKey(document);
    const bodyEvent = dispatchKey(document.body);

    expect(connectedRoot.ownsEvent(ownedEvent)).toBe(true);
    expect(connectedRoot.ownsEvent(shellEvent)).toBe(false);
    expect(connectedRoot.ownsEvent(windowEvent)).toBe(true);
    expect(connectedRoot.ownsEvent(documentEvent)).toBe(true);
    expect(connectedRoot.ownsEvent(bodyEvent)).toBe(true);
    expect(denyAllKeyboardAdapter.ownsEvent(ownedEvent)).toBe(false);

    root.remove();
    expect(connectedRoot.ownsEvent(ownedEvent)).toBe(false);
    shellTarget.remove();
  });
});
