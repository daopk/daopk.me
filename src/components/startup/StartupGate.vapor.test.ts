import { beforeEach, describe, expect, it, vi } from "vitest";

import { flushPromises, mountVaporTest as mount } from "~/test/mountVapor";
import {
  clearActiveProfileSession,
  getActiveProfileSession,
  setActiveProfileSession,
} from "~/core/profile/ProfileSession";
import { serviceWorkerUpdateController } from "~/service-worker/updateController";

import StartupGate from "./StartupGate.vue";

const mocks = vi.hoisted(() => ({
  bootstrapGuest: vi.fn(),
  dispose: vi.fn(),
}));

const guestSession = {
  profileId: "guest",
  displayName: "Guest",
  owner: { kind: "guest" as const },
};

vi.mock("~/core/profile/ProfileLifecycle", () => ({
  createProfileLifecycle: () => ({
    bootstrapGuest: mocks.bootstrapGuest,
    linkActiveGuest: vi.fn(),
    dispose: mocks.dispose,
  }),
}));

describe("StartupGate", () => {
  beforeEach(() => {
    clearActiveProfileSession();
    serviceWorkerUpdateController.resetForTests();
    vi.clearAllMocks();
    mocks.bootstrapGuest.mockImplementation(async () => {
      setActiveProfileSession(guestSession);
      return guestSession;
    });
  });

  it("bootstraps the guest profile automatically", async () => {
    const wrapper = mount(StartupGate);
    await flushPromises();

    expect(mocks.bootstrapGuest).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("waits for initial update discovery before bootstrapping", async () => {
    let completePreflight: (() => void) | undefined;
    const updatePreflight = new Promise<void>((resolve) => {
      completePreflight = resolve;
    });
    const wrapper = mount(StartupGate, { props: { updatePreflight } });
    await flushPromises();

    expect(mocks.bootstrapGuest).not.toHaveBeenCalled();

    completePreflight?.();
    await flushPromises();

    expect(mocks.bootstrapGuest).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("does not bootstrap when initial discovery finds an installing update", async () => {
    let completePreflight: (() => void) | undefined;
    const updatePreflight = new Promise<void>((resolve) => {
      completePreflight = resolve;
    });
    const wrapper = mount(StartupGate, { props: { updatePreflight } });

    serviceWorkerUpdateController.notifyUpdateInstalling();
    completePreflight?.();
    await flushPromises();

    expect(mocks.bootstrapGuest).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Updating WebOS");
    wrapper.unmount();
  });

  it("does not bootstrap while an app update is pending", async () => {
    const update = vi.fn(() => new Promise<void>(() => undefined));
    serviceWorkerUpdateController.notifyUpdateAvailable(update);

    const wrapper = mount(StartupGate);
    await flushPromises();

    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.bootstrapGuest).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Updating WebOS");
    wrapper.unmount();
  });

  it("keeps update failures retryable without opening a profile", async () => {
    const update = vi.fn(async () => {
      throw new Error("network down");
    });
    serviceWorkerUpdateController.notifyUpdateAvailable(update);

    const wrapper = mount(StartupGate);
    await flushPromises();

    expect(mocks.bootstrapGuest).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Update couldn't finish");
    expect(wrapper.text()).toContain("network down");

    const retry = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Retry update"));
    await retry?.trigger("click");
    await flushPromises();
    expect(update).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("rolls back profile activation when an update appears during bootstrap", async () => {
    let finishBootstrap: (() => void) | undefined;
    mocks.bootstrapGuest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishBootstrap = () => {
            setActiveProfileSession(guestSession);
            resolve(guestSession);
          };
        }),
    );
    const wrapper = mount(StartupGate);
    await flushPromises();
    expect(mocks.bootstrapGuest).toHaveBeenCalledTimes(1);

    const update = vi.fn(() => new Promise<void>(() => undefined));
    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    finishBootstrap?.();
    await flushPromises();

    expect(getActiveProfileSession()).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Updating WebOS");
    wrapper.unmount();
  });

  it("does not auto-retry an update failure that appears during bootstrap", async () => {
    let finishBootstrap: (() => void) | undefined;
    mocks.bootstrapGuest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishBootstrap = () => {
            setActiveProfileSession(guestSession);
            resolve(guestSession);
          };
        }),
    );
    const wrapper = mount(StartupGate);
    await flushPromises();

    const update = vi.fn(async () => {
      throw new Error("network down");
    });
    serviceWorkerUpdateController.notifyUpdateAvailable(update);
    await flushPromises();
    finishBootstrap?.();
    await flushPromises();

    expect(getActiveProfileSession()).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Update couldn't finish");
    wrapper.unmount();
  });

  it("shows a retryable startup error and retries profile bootstrap", async () => {
    mocks.bootstrapGuest
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockImplementationOnce(async () => {
        setActiveProfileSession(guestSession);
        return guestSession;
      });

    const wrapper = mount(StartupGate);
    await flushPromises();

    expect(wrapper.text()).toContain("storage unavailable");
    const retry = wrapper.findAll("button").find((button) => button.text() === "Retry");
    await retry?.trigger("click");
    await flushPromises();

    expect(mocks.bootstrapGuest).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
