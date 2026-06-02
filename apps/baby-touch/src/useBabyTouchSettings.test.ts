import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { useBabyTouchSettings } from "./useBabyTouchSettings";

function mountBabyTouchSettingsHarness(storage: Storage) {
  let api!: ReturnType<typeof useBabyTouchSettings>;
  const wrapper = mount(
    defineComponent({
      name: "BabyTouchSettingsHarness",
      setup() {
        api = useBabyTouchSettings({ storage });
        return () => h("div");
      },
    }),
  );
  return { api, wrapper };
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
      scene: "animals",
      intensity: "lively",
      soundEnabled: true,
      volume: 72,
    });
    await nextTick();
    first.wrapper.unmount();

    const second = mountBabyTouchSettingsHarness(localStorage);

    expect(second.api.settings.value).toEqual({
      background: "sky",
      scene: "animals",
      intensity: "lively",
      soundEnabled: true,
      volume: 72,
    });

    second.wrapper.unmount();
  });
});
