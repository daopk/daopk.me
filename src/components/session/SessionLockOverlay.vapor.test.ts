import { nextTick, shallowRef, type ShallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";
import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";
import type { ProfileSessionSnapshot } from "~/types/profile";

import SessionLockOverlay from "./SessionLockOverlay.vue";

const guestSession: ProfileSessionSnapshot = {
  profileId: "guest",
  displayName: "Guest",
  owner: { kind: "guest" },
};

function submitLockForm(): void {
  const form = document.body.querySelector(".session-lock__actions");
  expect(form).toBeInstanceOf(HTMLFormElement);
  form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function makeKernel(
  current: ProfileSessionSnapshot = guestSession,
  locked: ShallowRef<boolean> = shallowRef(true),
) {
  const unlock = vi.fn(() => {
    locked.value = false;
  });
  const kernel = {
    profile: {
      current: vi.fn(() => current),
      useLocked: vi.fn(() => locked),
      unlock,
    },
    events: {
      on: vi.fn(() => () => undefined),
    },
  } as unknown as Kernel;

  return { kernel, locked, unlock };
}

function mountOverlay(kernel: Kernel) {
  return mount(SessionLockOverlay, {
    attachTo: document.body,
    global: {
      provide: {
        [KernelInjectionKey as symbol]: kernel,
      },
    },
  });
}

describe("SessionLockOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    serviceWorkerUpdateController.resetForTests();
  });

  afterEach(() => {
    serviceWorkerUpdateController.resetForTests();
  });

  it("auto-applies a pending app update while the session is locked", async () => {
    const update = vi.fn(() => new Promise<void>(() => undefined));
    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    const { kernel, unlock } = makeKernel();

    const wrapper = mountOverlay(kernel);
    await flushPromises();

    expect(update).toHaveBeenCalledTimes(1);
    expect(unlock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Updating WebOS");
    expect(document.body.querySelector(".session-lock__actions")).toBeNull();
    wrapper.unmount();
  });

  it("waits for an installing update before refreshing", async () => {
    const update = vi.fn(() => new Promise<void>(() => undefined));
    serviceWorkerUpdateController.notifyUpdateInstalling();
    const { kernel } = makeKernel();

    const wrapper = mountOverlay(kernel);
    await flushPromises();

    expect(update).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Updating WebOS");

    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    await nextTick();
    expect(update).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("does not apply an update when the session is already unlocked", async () => {
    const update = vi.fn(async () => undefined);
    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    const { kernel } = makeKernel(guestSession, shallowRef(false));

    const wrapper = mountOverlay(kernel);
    await flushPromises();

    expect(update).not.toHaveBeenCalled();
    expect(document.body.querySelector(".session-lock")).toBeNull();
    wrapper.unmount();
  });

  it("keeps locked users on a retryable update error screen", async () => {
    const update = vi.fn(async () => {
      throw new Error("network down");
    });
    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    const { kernel, unlock } = makeKernel();

    const wrapper = mountOverlay(kernel);
    await flushPromises();

    expect(document.body.textContent).toContain("Update couldn't finish");
    expect(document.body.textContent).toContain("network down");
    expect(unlock).not.toHaveBeenCalled();

    const retry = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Retry update"),
    );
    retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(update).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("unlocks the current session without credentials or sign-out controls", async () => {
    const { kernel, unlock } = makeKernel();
    const wrapper = mountOverlay(kernel);

    submitLockForm();
    await flushPromises();

    expect(unlock).toHaveBeenCalledWith();
    expect(document.body.textContent).not.toContain("Sign Out");
    await vi.waitFor(() => expect(document.body.querySelector(".session-lock")).toBeNull());
    wrapper.unmount();
  });

  it("keeps the privacy lock non-dismissible and initially focuses Unlock", async () => {
    const { kernel } = makeKernel();
    const wrapper = mountOverlay(kernel);
    await flushPromises();

    const unlock = document.body.querySelector(".session-lock__unlock");
    expect(unlock).toBeInstanceOf(HTMLButtonElement);
    await vi.waitFor(() => expect(document.activeElement).toBe(unlock));

    unlock?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const overlay = document.body.querySelector(".session-lock__overlay");
    overlay?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    await nextTick();

    expect(document.body.querySelector(".session-lock")).not.toBeNull();
    wrapper.unmount();
  });
});
