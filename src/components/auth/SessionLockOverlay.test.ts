import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowRef, type ShallowRef } from "vue";

import type { Kernel } from "~/types/kernel";
import { KernelInjectionKey } from "~/types/kernel";
import type {
  ActiveProfileSession,
  PasskeyProfileRecord,
  ProfileSessionSnapshot,
} from "~/types/profile";
import { ProfileStore } from "~/core/profile/ProfileStore";

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
    vi.clearAllMocks();
    mocks.isAvailable.mockReturnValue(true);
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
    expect(document.body.querySelector(".session-lock")).toBeNull();

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
    expect(document.body.querySelector(".session-lock")).toBeNull();

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
