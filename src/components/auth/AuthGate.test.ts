import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuthGate from "~/components/auth/AuthGate.vue";
import { clearActiveProfileSession, getActiveProfileSession } from "~/core/profile/ProfileSession";
import { ProfileStore } from "~/core/profile/ProfileStore";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";
import type { ActiveProfileSession, ProfileRecord } from "~/types/profile";

const mocks = vi.hoisted(() => {
  const registeredAppIds = ["about", "blog", "settings"];
  return {
    createProfilePasskey: vi.fn(),
    unlockProfile: vi.fn(),
    isAvailable: vi.fn(),
    migrateGlobalDataToProfile: vi.fn(),
    registeredAppIds,
    appsList: vi.fn(() => registeredAppIds.map((id) => ({ id }))),
    eventsEmit: vi.fn(),
  };
});

vi.mock("~/core/profile/PasskeyService", () => ({
  ProfileAuthError: class ProfileAuthError extends Error {},
  PasskeyService: class PasskeyService {
    createProfilePasskey = mocks.createProfilePasskey;
    unlockProfile = mocks.unlockProfile;
    isAvailable = mocks.isAvailable;
  },
}));

vi.mock("~/core/profile/migration", () => ({
  migrateGlobalDataToProfile: mocks.migrateGlobalDataToProfile,
}));

vi.mock("~/composables/useKernel", () => ({
  useKernel: () => ({
    apps: {
      list: mocks.appsList,
    },
    events: {
      emit: mocks.eventsEmit,
    },
  }),
}));

const profile: ProfileRecord = {
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

const betaProfile: ProfileRecord = {
  ...profile,
  id: "beta",
  displayName: "Beta",
  credentialId: "beta-credential",
  userHandle: "beta-user",
  publicKey: "beta-public-key",
};

const session: ActiveProfileSession = {
  profileId: "alpha",
  displayName: "Alpha",
  authMode: "passkey",
  encryption: "none",
  encrypted: false,
};

const betaSession: ActiveProfileSession = {
  profileId: "beta",
  displayName: "Beta",
  authMode: "passkey",
  encryption: "none",
  encrypted: false,
};

function findButtonByText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll("button").find((button) => button.text() === text);
}

describe("AuthGate", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    clearActiveProfileSession();
    serviceWorkerUpdateController.resetForTests();
    vi.clearAllMocks();
    mocks.registeredAppIds.splice(0, mocks.registeredAppIds.length, "about", "blog", "settings");
    mocks.isAvailable.mockReturnValue(true);
    mocks.migrateGlobalDataToProfile.mockResolvedValue(undefined);
  });

  it("auto-creates and opens a guest account when no profiles exist", async () => {
    const wrapper = mount(AuthGate);
    await flushPromises();

    expect(mocks.createProfilePasskey).not.toHaveBeenCalled();
    expect(mocks.migrateGlobalDataToProfile).toHaveBeenCalledWith({
      profileId: expect.stringMatching(/^profile-/u),
      encryptionKey: undefined,
    });
    expect(getActiveProfileSession()).toMatchObject({
      displayName: "Guest",
      authMode: "guest",
      encryption: "none",
      encrypted: false,
    });
    expect(wrapper.emitted("authenticated")).toHaveLength(1);

    const store = new ProfileStore();
    expect(store.getGuest()).toMatchObject({ displayName: "Guest" });
    store.dispose();
  });

  it("lets unauthenticated users apply a pending app update", async () => {
    const store = new ProfileStore();
    store.add(profile);
    store.markGlobalImported();
    store.dispose();
    const update = vi.fn(async () => undefined);
    serviceWorkerUpdateController.notifyUpdateAvailable(update);

    const wrapper = mount(AuthGate);
    const updateButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Update app"));
    const root = wrapper.get(".auth-gate");
    const updateBanner = wrapper.get(".auth-gate__update");

    expect(wrapper.text()).toContain("A newer version is ready.");
    expect(root.classes()).toContain("auth-gate--with-update");
    expect(root.element.firstElementChild).toBe(updateBanner.element);
    expect(updateBanner.get(".auth-gate__update-copy").attributes("role")).toBe("status");
    expect(updateButton).toBeDefined();

    await updateButton?.trigger("click");

    expect(update).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("authenticated")).toBeUndefined();
  });

  it("creates a passkey profile from an existing guest picker", async () => {
    const store = new ProfileStore();
    store.add({
      id: "guest",
      displayName: "Guest",
      createdAt: 1,
      authMode: "guest",
      encryption: "none",
    });
    store.markGlobalImported();
    store.dispose();
    mocks.createProfilePasskey.mockResolvedValue({ profile, session });

    const wrapper = mount(AuthGate);
    await flushPromises();
    await findButtonByText(wrapper, "Add passkey account")?.trigger("click");
    await wrapper.find("input").setValue("Alpha");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(mocks.createProfilePasskey).toHaveBeenCalledWith({
      profileId: expect.stringMatching(/^profile-/u),
      displayName: "Alpha",
    });
    expect(mocks.migrateGlobalDataToProfile).not.toHaveBeenCalled();
    expect(getActiveProfileSession()?.profileId).toBe("alpha");
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("unlocks an existing profile from the picker", async () => {
    const store = new ProfileStore();
    store.add(profile);
    store.markGlobalImported();
    store.dispose();
    mocks.unlockProfile.mockResolvedValue(session);

    const wrapper = mount(AuthGate);
    await flushPromises();
    await wrapper.find(".auth-gate__button").trigger("click");
    await flushPromises();

    expect(mocks.unlockProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "alpha" }));
    expect(getActiveProfileSession()?.profileId).toBe("alpha");
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("creates and opens a guest account without passkey availability", async () => {
    const store = new ProfileStore();
    store.add(profile);
    store.markGlobalImported();
    store.dispose();
    mocks.isAvailable.mockReturnValue(false);

    const wrapper = mount(AuthGate);
    await flushPromises();
    await findButtonByText(wrapper, "Add account")?.trigger("click");
    await wrapper.find("input").setValue("Visitor");
    await findButtonByText(wrapper, "Continue as guest")?.trigger("click");
    await flushPromises();

    expect(mocks.createProfilePasskey).not.toHaveBeenCalled();
    expect(mocks.migrateGlobalDataToProfile).not.toHaveBeenCalled();
    expect(getActiveProfileSession()).toMatchObject({
      displayName: "Visitor",
      authMode: "guest",
      encryption: "none",
      encrypted: false,
    });
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("opens an existing guest account without WebAuthn", async () => {
    const store = new ProfileStore();
    store.add({
      id: "guest",
      displayName: "Guest",
      createdAt: 1,
      authMode: "guest",
      encryption: "none",
    });
    store.markGlobalImported();
    store.dispose();
    mocks.isAvailable.mockReturnValue(false);

    const wrapper = mount(AuthGate);
    await flushPromises();

    expect(wrapper.text()).toContain("Guest account");

    await findButtonByText(wrapper, "Open guest")?.trigger("click");
    await flushPromises();

    expect(mocks.unlockProfile).not.toHaveBeenCalled();
    expect(getActiveProfileSession()).toMatchObject({
      profileId: "guest",
      authMode: "guest",
    });
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("auto-opens a sole guest account for a registered deep link", async () => {
    const store = new ProfileStore();
    store.add({
      id: "guest",
      displayName: "Guest",
      createdAt: 1,
      authMode: "guest",
      encryption: "none",
    });
    store.markGlobalImported();
    store.dispose();
    mocks.isAvailable.mockReturnValue(false);
    window.history.replaceState(null, "", "/apps/about");

    const wrapper = mount(AuthGate);
    await flushPromises();

    expect(mocks.unlockProfile).not.toHaveBeenCalled();
    expect(getActiveProfileSession()).toMatchObject({
      profileId: "guest",
      authMode: "guest",
    });
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("does not auto-open a sole guest account from the homepage", async () => {
    const store = new ProfileStore();
    store.add({
      id: "guest",
      displayName: "Guest",
      createdAt: 1,
      authMode: "guest",
      encryption: "none",
    });
    store.markGlobalImported();
    store.dispose();
    mocks.isAvailable.mockReturnValue(false);

    const wrapper = mount(AuthGate);
    await flushPromises();

    expect(getActiveProfileSession()).toBeNull();
    expect(wrapper.emitted("authenticated")).toBeUndefined();
    expect(wrapper.text()).toContain("Guest account");
  });

  it("does not auto-unlock a sole passkey account for a registered deep link", async () => {
    const store = new ProfileStore();
    store.add(profile);
    store.markGlobalImported();
    store.dispose();
    window.history.replaceState(null, "", "/apps/about");

    const wrapper = mount(AuthGate);
    await flushPromises();

    expect(mocks.unlockProfile).not.toHaveBeenCalled();
    expect(getActiveProfileSession()).toBeNull();
    expect(wrapper.emitted("authenticated")).toBeUndefined();
    expect(wrapper.text()).toContain("Alpha");
  });

  it("does not auto-open when a deep link has multiple local accounts", async () => {
    const store = new ProfileStore();
    store.add(profile);
    store.add({
      id: "guest",
      displayName: "Guest",
      createdAt: 2,
      authMode: "guest",
      encryption: "none",
    });
    store.markGlobalImported();
    store.dispose();
    window.history.replaceState(null, "", "/apps/about");

    const wrapper = mount(AuthGate);
    await flushPromises();

    expect(getActiveProfileSession()).toBeNull();
    expect(wrapper.emitted("authenticated")).toBeUndefined();
    expect(wrapper.text()).toContain("Alpha");
    expect(wrapper.text()).toContain("Guest");
  });

  it("does not offer a second guest account when the singleton guest already exists", async () => {
    const store = new ProfileStore();
    store.add({
      id: "guest",
      displayName: "Guest",
      createdAt: 1,
      authMode: "guest",
      encryption: "none",
    });
    store.markGlobalImported();
    store.dispose();

    const wrapper = mount(AuthGate);
    await flushPromises();

    expect(wrapper.text()).toContain("Guest account");
    expect(wrapper.text()).toContain("Add passkey account");

    await findButtonByText(wrapper, "Add passkey account")?.trigger("click");

    expect(wrapper.find("form").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Continue as guest");
    expect(wrapper.text()).toContain("Back to accounts");
  });

  it("opens the persisted singleton guest if another tab creates it before submit", async () => {
    const existingStore = new ProfileStore();
    existingStore.add(profile);
    existingStore.markGlobalImported();
    existingStore.dispose();

    const wrapper = mount(AuthGate);
    await flushPromises();
    await findButtonByText(wrapper, "Add account")?.trigger("click");

    const store = new ProfileStore();
    store.add({
      id: "persisted-guest",
      displayName: "Guest",
      createdAt: 1,
      authMode: "guest",
      encryption: "none",
    });
    store.dispose();

    await findButtonByText(wrapper, "Continue as guest")?.trigger("click");
    await flushPromises();

    expect(mocks.migrateGlobalDataToProfile).not.toHaveBeenCalled();
    expect(getActiveProfileSession()).toMatchObject({
      profileId: "persisted-guest",
      authMode: "guest",
    });
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });

  it("lets users add another local account without importing the first workspace", async () => {
    const store = new ProfileStore();
    store.add(profile);
    store.markGlobalImported();
    store.dispose();
    mocks.createProfilePasskey.mockResolvedValue({ profile: betaProfile, session: betaSession });

    const wrapper = mount(AuthGate);
    await flushPromises();

    expect(wrapper.text()).toContain("Add account");

    await findButtonByText(wrapper, "Add account")?.trigger("click");
    await wrapper.find("input").setValue("Beta");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(mocks.createProfilePasskey).toHaveBeenCalledWith({
      profileId: expect.stringMatching(/^profile-/u),
      displayName: "Beta",
    });
    expect(mocks.migrateGlobalDataToProfile).not.toHaveBeenCalled();
    expect(getActiveProfileSession()?.profileId).toBe("beta");
    expect(wrapper.emitted("authenticated")).toHaveLength(1);
  });
});
