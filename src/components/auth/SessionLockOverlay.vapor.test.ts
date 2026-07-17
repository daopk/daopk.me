import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, shallowRef, type ShallowRef } from "vue";

import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";
import type {
  ActiveProfileSession,
  PasskeyProfileRecord,
  ProfileSessionSnapshot,
} from "~/types/profile";
import { ProfileStore } from "~/core/profile/ProfileStore";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";

import SessionLockOverlay from "./SessionLockOverlay.vue";

const mocks = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  unlockProfile: vi.fn(),
}));

vi.mock("~/core/profile/PasskeyService", () => ({
  ProfileAuthError: class ProfileAuthError extends Error {},
  PasskeyService: class PasskeyService {
    isAvailable = mocks.isAvailable;
    unlockProfile = mocks.unlockProfile;
  },
}));

const passkeyProfile: PasskeyProfileRecord = {
  id: "alpha",
  displayName: "Alpha",
  createdAt: 1,
  authMode: "passkey",
  credentialId: "credential",
  userHandle: "user",
  publicKey: "public-key",
  publicKeyAlg: -7,
  transports: ["internal"],
  encryption: "none",
};

const passkeySession: ActiveProfileSession = {
  profileId: "alpha",
  displayName: "Alpha",
  authMode: "passkey",
  encryption: "none",
  encrypted: false,
};

function submitLockForm(): void {
  const form = document.body.querySelector(".session-lock__actions");
  expect(form).toBeInstanceOf(HTMLFormElement);
  form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function makeKernel(
  current: ProfileSessionSnapshot = passkeySession,
  locked: ShallowRef<boolean> = shallowRef(true),
) {
  const unlock = vi.fn((_session?: ActiveProfileSession) => {
    locked.value = false;
  });
  const signOut = vi.fn(async () => undefined);
  const kernel = {
    profile: {
      current: vi.fn(() => current),
      useLocked: vi.fn(() => locked),
      unlock,
      signOut,
    },
    events: {
      on: vi.fn(() => () => undefined),
    },
  } as unknown as Kernel;

  return { kernel, locked, unlock, signOut };
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
    localStorage.clear();
    serviceWorkerUpdateController.resetForTests();
    vi.clearAllMocks();
    mocks.isAvailable.mockReturnValue(true);
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
    expect(document.body.textContent).toContain("Applying the newest web version.");
    expect(document.body.querySelector(".session-lock__actions")).toBeNull();

    wrapper.unmount();
  });

  it("shows the update screen while an app update is installing before refreshing", async () => {
    const update = vi.fn(() => new Promise<void>(() => undefined));
    serviceWorkerUpdateController.notifyUpdateInstalling();
    const { kernel, unlock } = makeKernel();

    const wrapper = mountOverlay(kernel);
    await flushPromises();

    expect(update).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Updating WebOS");
    expect(document.body.textContent).toContain("Applying the newest web version.");
    expect(document.body.querySelector(".session-lock__actions")).toBeNull();

    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    await nextTick();

    expect(update).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("does not auto-apply a pending app update when the session is already unlocked", async () => {
    const update = vi.fn(async () => undefined);
    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    const { kernel } = makeKernel(passkeySession, shallowRef(false));

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

    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.unlockProfile).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Update couldn't finish");
    expect(document.body.textContent).toContain("network down");
    expect(document.body.querySelector(".session-lock__actions")).toBeNull();

    const retry = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Retry update"),
    );
    expect(retry).toBeInstanceOf(HTMLButtonElement);
    retry?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(update).toHaveBeenCalledTimes(2);
    expect(mocks.unlockProfile).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("unlocks a passkey profile through PasskeyService and hides the overlay", async () => {
    const store = new ProfileStore();
    store.add(passkeyProfile);
    store.dispose();
    mocks.unlockProfile.mockResolvedValue(passkeySession);
    const { kernel, unlock } = makeKernel();

    const wrapper = mountOverlay(kernel);
    submitLockForm();
    await flushPromises();

    expect(mocks.unlockProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "alpha" }));
    expect(unlock).toHaveBeenCalledWith(passkeySession);
    await vi.waitFor(() => expect(document.body.querySelector(".session-lock")).toBeNull());

    wrapper.unmount();
  });

  it("keeps the lock modal non-dismissible and initially focuses Unlock", async () => {
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

  it("unlocks guest sessions without calling WebAuthn", async () => {
    const guest: ProfileSessionSnapshot = {
      profileId: "guest",
      displayName: "Guest",
      authMode: "guest",
      encryption: "none",
      encrypted: false,
    };
    const { kernel, unlock } = makeKernel(guest);

    const wrapper = mountOverlay(kernel);
    submitLockForm();
    await flushPromises();

    expect(mocks.unlockProfile).not.toHaveBeenCalled();
    expect(unlock).toHaveBeenCalledWith();
    await vi.waitFor(() => expect(document.body.querySelector(".session-lock")).toBeNull());

    wrapper.unmount();
  });

  it("keeps the session locked when passkey unlock fails", async () => {
    const store = new ProfileStore();
    store.add(passkeyProfile);
    store.dispose();
    mocks.unlockProfile.mockRejectedValue(new Error("Passkey prompt was cancelled."));
    const { kernel, locked, unlock } = makeKernel();

    const wrapper = mountOverlay(kernel);
    submitLockForm();
    await flushPromises();

    expect(unlock).not.toHaveBeenCalled();
    expect(locked.value).toBe(true);
    expect(document.body.textContent).toContain("Passkey prompt was cancelled.");

    wrapper.unmount();
  });
});
