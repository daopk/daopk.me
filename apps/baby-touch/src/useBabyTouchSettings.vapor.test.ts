import { mountVaporComposable } from "~/test/mountVapor";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { useBabyTouchSettings } from "./useBabyTouchSettings";

function mountBabyTouchSettingsHarness(storage: Storage) {
  const mounted = mountVaporComposable(() => useBabyTouchSettings({ storage }));
  return { api: mounted.result, wrapper: mounted.wrapper };
}

describe("useBabyTouchSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("persists parent settings and reloads them", async () => {
    const first = mountBabyTouchSettingsHarness(localStorage);

    first.api.updateSettings({
      scene: "soft-animals",
      intensity: "lively",
      soundEnabled: true,
      volume: 72,
    });
    await nextTick();
    first.wrapper.unmount();

    const second = mountBabyTouchSettingsHarness(localStorage);

    expect(second.api.settings.value).toEqual({
      background: "sky",
      scene: "soft-animals",
      intensity: "lively",
      soundEnabled: true,
      volume: 72,
    });
    expect(second.api.settingsLabel.value).toBe("Soft Animals scene");

    second.wrapper.unmount();
  });
});
