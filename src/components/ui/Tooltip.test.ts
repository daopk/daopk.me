import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import Tooltip from "./Tooltip.vue";

describe("Tooltip", () => {
  it("renders its trigger slot", () => {
    const wrapper = mount(Tooltip, {
      props: { label: "More info" },
      slots: { default: "<button>Trigger</button>" },
    });
    expect(wrapper.find("button").text()).toBe("Trigger");
  });

  it("mounts cleanly when disabled", () => {
    const wrapper = mount(Tooltip, {
      props: { label: "Hidden", disabled: true },
      slots: { default: "<button>Trigger</button>" },
    });
    expect(wrapper.find("button").exists()).toBe(true);
  });
});
