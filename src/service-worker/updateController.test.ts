import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serviceWorkerUpdateController } from "~/service-worker/updateController";

describe("serviceWorkerUpdateController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    serviceWorkerUpdateController.resetForTests();
  });

  afterEach(() => {
    serviceWorkerUpdateController.resetForTests();
    vi.useRealTimers();
  });

  it("starts idle without Settings attention", () => {
    expect(serviceWorkerUpdateController.state.value).toEqual({ kind: "idle" });
    expect(serviceWorkerUpdateController.checkState.value).toEqual({ kind: "idle" });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(false);
  });

  it("shows update state and Settings attention when an update is available", () => {
    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: false,
    });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(true);
  });

  it("shows an installing update before the refresh action is available", () => {
    serviceWorkerUpdateController.notifyUpdateInstalling();

    expect(serviceWorkerUpdateController.state.value).toEqual({ kind: "update-installing" });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(false);
  });

  it("moves from installing to update available when the worker is waiting", () => {
    serviceWorkerUpdateController.notifyUpdateInstalling();
    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: false,
    });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(true);
  });

  it("clears an installing update that becomes redundant", () => {
    serviceWorkerUpdateController.notifyUpdateInstalling();

    serviceWorkerUpdateController.clearUpdateInstalling();

    expect(serviceWorkerUpdateController.state.value).toEqual({ kind: "idle" });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(false);
  });

  it("dismiss hides the update state and clears Settings attention", () => {
    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));

    serviceWorkerUpdateController.dismiss();

    expect(serviceWorkerUpdateController.state.value).toEqual({ kind: "idle" });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(false);
  });

  it("a later update event after dismiss shows the update again", () => {
    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    serviceWorkerUpdateController.dismiss();

    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: false,
    });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(true);
  });

  it("refresh invokes the stored callback and stays busy while the browser reloads", async () => {
    const update = vi.fn(async () => undefined);
    serviceWorkerUpdateController.notifyUpdateAvailable(update);

    await serviceWorkerUpdateController.refresh();

    expect(update).toHaveBeenCalledTimes(1);
    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: true,
    });
  });

  it("refresh exposes a pending state while the update callback is running", () => {
    const update = vi.fn(() => new Promise<void>(() => undefined));
    serviceWorkerUpdateController.notifyUpdateAvailable(update);

    void serviceWorkerUpdateController.refresh();

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: true,
    });
  });

  it("duplicate refresh calls while pending invoke the callback once", async () => {
    let resolveUpdate: (() => void) | undefined;
    const update = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    serviceWorkerUpdateController.notifyUpdateAvailable(update);

    const first = serviceWorkerUpdateController.refresh();
    const second = serviceWorkerUpdateController.refresh();

    expect(update).toHaveBeenCalledTimes(1);
    resolveUpdate?.();
    await Promise.all([first, second]);
  });

  it("stale refresh resolution does not clear a newer update", async () => {
    let resolveFirst: (() => void) | undefined;
    const firstUpdate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    serviceWorkerUpdateController.notifyUpdateAvailable(firstUpdate);
    const firstRefresh = serviceWorkerUpdateController.refresh();

    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    resolveFirst?.();
    await firstRefresh;

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: false,
    });
  });

  it("stale refresh rejection does not overwrite a newer update", async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    const firstUpdate = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    serviceWorkerUpdateController.notifyUpdateAvailable(firstUpdate);
    const firstRefresh = serviceWorkerUpdateController.refresh();

    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    rejectFirst?.(new Error("old update failed"));
    await firstRefresh;

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: false,
    });
  });

  it("refresh rejection surfaces an error and keeps Settings attention", async () => {
    const update = vi.fn(async () => {
      throw new Error("network down");
    });
    serviceWorkerUpdateController.notifyUpdateAvailable(update);

    await serviceWorkerUpdateController.refresh();

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "refresh-error",
      message: "network down",
    });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(true);
  });

  it("manual check reports when checks are unavailable", async () => {
    await serviceWorkerUpdateController.checkForUpdate();

    expect(serviceWorkerUpdateController.checkState.value).toEqual({
      kind: "check-error",
      message: "Manual update checks are not available in this build.",
    });
  });

  it("manual check invokes the registered checker and reports up to date", async () => {
    const check = vi.fn(async () => undefined);
    serviceWorkerUpdateController.setUpdateChecker(check);

    await serviceWorkerUpdateController.checkForUpdate();

    expect(check).toHaveBeenCalledTimes(1);
    expect(serviceWorkerUpdateController.checkState.value).toEqual({ kind: "up-to-date" });
  });

  it("duplicate manual checks while pending invoke the checker once", async () => {
    let resolveCheck: (() => void) | undefined;
    const check = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    serviceWorkerUpdateController.setUpdateChecker(check);

    const first = serviceWorkerUpdateController.checkForUpdate();
    const second = serviceWorkerUpdateController.checkForUpdate();

    expect(check).toHaveBeenCalledTimes(1);
    expect(serviceWorkerUpdateController.checkState.value).toEqual({ kind: "checking" });

    resolveCheck?.();
    await Promise.all([first, second]);

    expect(serviceWorkerUpdateController.checkState.value).toEqual({ kind: "up-to-date" });
  });

  it("manual check rejection reports a check error", async () => {
    serviceWorkerUpdateController.setUpdateChecker(
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await serviceWorkerUpdateController.checkForUpdate();

    expect(serviceWorkerUpdateController.checkState.value).toEqual({
      kind: "check-error",
      message: "network down",
    });
  });

  it("manual check does not overwrite a discovered update", async () => {
    serviceWorkerUpdateController.setUpdateChecker(
      vi.fn(async () => {
        serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
      }),
    );

    await serviceWorkerUpdateController.checkForUpdate();

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: false,
    });
    expect(serviceWorkerUpdateController.checkState.value).toEqual({ kind: "idle" });
  });

  it("manual check does not report up to date after discovering an installing update", async () => {
    serviceWorkerUpdateController.setUpdateChecker(
      vi.fn(async () => {
        serviceWorkerUpdateController.notifyUpdateInstalling();
      }),
    );

    await serviceWorkerUpdateController.checkForUpdate();

    expect(serviceWorkerUpdateController.state.value).toEqual({ kind: "update-installing" });
    expect(serviceWorkerUpdateController.checkState.value).toEqual({ kind: "idle" });
  });

  it("offline-ready auto-dismisses without Settings attention", () => {
    serviceWorkerUpdateController.notifyOfflineReady();

    expect(serviceWorkerUpdateController.state.value).toEqual({ kind: "offline-ready" });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(false);

    vi.advanceTimersByTime(3_000);

    expect(serviceWorkerUpdateController.state.value).toEqual({ kind: "idle" });
  });

  it("offline-ready does not override visible update or error states", async () => {
    serviceWorkerUpdateController.notifyUpdateInstalling();
    serviceWorkerUpdateController.notifyOfflineReady();
    expect(serviceWorkerUpdateController.state.value).toEqual({ kind: "update-installing" });

    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    serviceWorkerUpdateController.notifyOfflineReady();
    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: false,
    });

    serviceWorkerUpdateController.notifyUpdateAvailable(
      vi.fn(async () => {
        throw new Error("still waiting");
      }),
    );
    await serviceWorkerUpdateController.refresh();
    serviceWorkerUpdateController.notifyOfflineReady();

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "refresh-error",
      message: "still waiting",
    });
  });

  it("a stale offline-ready timer does not clear a later update", () => {
    serviceWorkerUpdateController.notifyOfflineReady();
    vi.advanceTimersByTime(1_000);

    serviceWorkerUpdateController.notifyUpdateAvailable(vi.fn(async () => undefined));
    vi.advanceTimersByTime(3_000);

    expect(serviceWorkerUpdateController.state.value).toEqual({
      kind: "update-available",
      refreshing: false,
    });
    expect(serviceWorkerUpdateController.hasSettingsAttention.value).toBe(true);
  });
});
