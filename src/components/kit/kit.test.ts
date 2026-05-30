import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import AppToolbar from "./AppToolbar.vue";
import Badge from "./Badge.vue";
import EmptyState from "./EmptyState.vue";
import FormField from "./FormField.vue";
import IconButton from "./IconButton.vue";
import SegmentedControl from "./SegmentedControl.vue";
import Select from "./Select.vue";
import StatusBanner from "./StatusBanner.vue";
import Textarea from "./Textarea.vue";
import TextInput from "./TextInput.vue";

const StubIcon = { template: '<svg data-testid="icon" />' };

describe("kit components", () => {
  it("renders AppToolbar sections and variants", () => {
    const wrapper = mount(AppToolbar, {
      props: { density: "comfortable", wrap: true },
      slots: {
        start: "left",
        default: "main",
        end: "right",
      },
    });

    expect(wrapper.element.tagName).toBe("HEADER");
    expect(wrapper.classes()).toContain("ds-kit-toolbar--comfortable");
    expect(wrapper.classes()).toContain("ds-kit-toolbar--wrap");
    expect(wrapper.text()).toContain("left");
    expect(wrapper.text()).toContain("main");
    expect(wrapper.text()).toContain("right");
  });

  it("renders IconButton with accessible icon-only semantics", async () => {
    let clicks = 0;
    const wrapper = mount(IconButton, {
      props: { label: "Refresh", icon: StubIcon, pressed: true },
      attrs: { onClick: () => clicks++ },
    });

    expect(wrapper.attributes("aria-label")).toBe("Refresh");
    expect(wrapper.attributes("aria-pressed")).toBe("true");
    expect(wrapper.find("[data-testid='icon']").exists()).toBe(true);

    await wrapper.trigger("click");
    expect(clicks).toBe(1);
  });

  it("emits updates from SegmentedControl", async () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: "list",
        label: "View mode",
        showLabels: false,
        options: [
          { value: "list", label: "List", icon: StubIcon },
          { value: "grid", label: "Grid", icon: StubIcon },
        ],
      },
    });

    expect(wrapper.find('[data-value="list"]').attributes("aria-pressed")).toBe("true");
    await wrapper.find('[data-value="grid"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["grid"]]);
    expect(wrapper.emitted("change")).toEqual([["grid"]]);
  });

  it("renders FormField copy and state messages", () => {
    const wrapper = mount(FormField, {
      props: { label: "Title", hint: "Required", required: true },
      slots: { default: '<input id="title" />' },
    });

    expect(wrapper.text()).toContain("Title");
    expect(wrapper.text()).toContain("Required");
    expect(wrapper.find("input").exists()).toBe(true);

    const errored = mount(FormField, {
      props: { label: "Title", hint: "Required", error: "Missing title" },
    });
    expect(errored.text()).toContain("Missing title");
    expect(errored.text()).not.toContain("Required");
  });

  it("emits updates from TextInput, Textarea, and Select", async () => {
    const input = mount(TextInput, { props: { modelValue: "old" } });
    await input.setValue("new");
    expect(input.emitted("update:modelValue")).toEqual([["new"]]);

    const textarea = mount(Textarea, { props: { modelValue: "old" } });
    await textarea.setValue("body");
    expect(textarea.emitted("update:modelValue")).toEqual([["body"]]);

    const select = mount(Select, {
      props: {
        modelValue: "one",
        options: [
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
        ],
      },
    });
    await select.setValue("two");
    expect(select.emitted("update:modelValue")).toEqual([["two"]]);
  });

  it("renders EmptyState, StatusBanner, and Badge tone classes", () => {
    const empty = mount(EmptyState, {
      props: { icon: StubIcon, title: "Nothing here", description: "Create something." },
    });
    expect(empty.text()).toContain("Nothing here");
    expect(empty.find("[data-testid='icon']").exists()).toBe(true);

    const banner = mount(StatusBanner, { props: { tone: "error" }, slots: { default: "Failed" } });
    expect(banner.classes()).toContain("ds-kit-status-banner--error");
    expect(banner.attributes("role")).toBe("status");

    const badge = mount(Badge, { props: { tone: "accent" }, slots: { default: "Read only" } });
    expect(badge.classes()).toContain("ds-kit-badge--accent");
    expect(badge.text()).toBe("Read only");
  });
});
