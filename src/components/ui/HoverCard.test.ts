import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import HoverCard from "./HoverCard.vue";

describe("HoverCard", () => {
  it("renders its trigger slot", () => {
    const wrapper = mount(HoverCard, {
      slots: {
        default: "<button>Preview</button>",
        content: "<div>Preview content</div>",
      },
    });

    expect(wrapper.find("button").text()).toBe("Preview");
  });

  it("renders only the trigger slot when disabled", () => {
    const wrapper = mount(HoverCard, {
      props: { disabled: true },
      slots: {
        default: "<button>Preview</button>",
        content: "<div>Preview content</div>",
      },
    });

    expect(wrapper.find("button").text()).toBe("Preview");
    expect(wrapper.text()).not.toContain("Preview content");
  });
});
