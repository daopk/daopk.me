import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import {
  AppChromeInjectionKey,
  type AppChromeBackAction,
  type AppChromeContentSize,
  type AppChromeController,
  type AppChromeTitlebarVisibility,
} from "~/types/app";

import ActionRow from "./ActionRow.vue";
import AppFrame from "./AppFrame.vue";
import AppToolbar from "./AppToolbar.vue";
import Badge from "./Badge.vue";
import Checkbox from "./Checkbox.vue";
import ChoiceCard from "./ChoiceCard.vue";
import ChoiceGrid from "./ChoiceGrid.vue";
import DataTable from "./DataTable.vue";
import EmptyState from "./EmptyState.vue";
import FormField from "./FormField.vue";
import GroupLabel from "./GroupLabel.vue";
import IconButton from "./IconButton.vue";
import ListButton from "./ListButton.vue";
import Panel from "./Panel.vue";
import ScrollArea from "./ScrollArea.vue";
import SectionHeader from "./SectionHeader.vue";
import SegmentedControl from "./SegmentedControl.vue";
import Select from "./Select.vue";
import Separator from "./Separator.vue";
import Spinner from "./Spinner.vue";
import StatusBanner from "./StatusBanner.vue";
import TabList from "./TabList.vue";
import Textarea from "./Textarea.vue";
import TextInput from "./TextInput.vue";
import ToolbarGroup from "./ToolbarGroup.vue";
import ToolbarTitle from "./ToolbarTitle.vue";
import { useAppChrome } from "./useAppChrome";

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

  it("renders AppFrame, Panel, and SectionHeader layout primitives", () => {
    const frame = mount(AppFrame, {
      props: { background: "subtle", layout: "flex-column" },
      slots: { default: "App" },
    });
    expect(frame.classes()).toContain("ds-kit-app-frame--subtle");
    expect(frame.classes()).toContain("ds-kit-app-frame--flex-column");
    expect((frame.vm as { element: Element | null }).element).toBe(frame.element);

    const panel = mount(Panel, {
      props: { variant: "elevated", padding: "lg" },
      slots: { default: "Panel" },
    });
    expect(panel.classes()).toContain("ds-kit-panel--elevated");
    expect(panel.classes()).toContain("ds-kit-panel--padding-lg");

    const header = mount(SectionHeader, {
      props: { title: "Settings", subtitle: "Tune the system.", icon: StubIcon },
      slots: { actions: "<button>Done</button>" },
    });
    expect(header.text()).toContain("Settings");
    expect(header.text()).toContain("Tune the system.");
    expect(header.find("[data-testid='icon']").exists()).toBe(true);
    expect(header.find("button").text()).toBe("Done");
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

  it("emits updates from TabList with tab semantics", async () => {
    const wrapper = mount(TabList, {
      props: {
        modelValue: "month",
        label: "Calendar view",
        tabs: [
          { value: "month", label: "Month", id: "tab-month", panelId: "panel-month" },
          { value: "week", label: "Week", id: "tab-week", panelId: "panel-week" },
        ],
      },
    });

    expect(wrapper.attributes("role")).toBe("tablist");
    expect(wrapper.find("#tab-month").attributes("aria-selected")).toBe("true");
    expect(wrapper.find("#tab-month").attributes("aria-controls")).toBe("panel-month");

    await wrapper.find("#tab-week").trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["week"]]);
    expect(wrapper.emitted("change")).toEqual([["week"]]);
  });

  it("renders ToolbarGroup and ListButton", async () => {
    let clicks = 0;
    const group = mount(ToolbarGroup, {
      props: { label: "Navigation", separated: true },
      slots: { default: "<button>Back</button>" },
    });
    expect(group.attributes("role")).toBe("group");
    expect(group.attributes("aria-label")).toBe("Navigation");
    expect(group.classes()).toContain("ds-kit-toolbar-group--separated");

    const row = mount(ListButton, {
      props: { title: "Alpha", meta: "Today", active: true, icon: StubIcon },
      attrs: { onClick: () => clicks++ },
    });
    expect(row.attributes("aria-current")).toBe("page");
    expect(row.text()).toContain("Alpha");
    expect(row.text()).toContain("Today");
    expect(row.find("[data-testid='icon']").exists()).toBe(true);

    await row.trigger("click");
    expect(clicks).toBe(1);
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

  it("renders ActionRow and DataTable semantics", () => {
    const row = mount(ActionRow, {
      props: { title: "Reduce motion", description: "Use simpler transitions." },
      slots: { default: "<button>Toggle</button>" },
    });
    expect(row.text()).toContain("Reduce motion");
    expect(row.text()).toContain("Use simpler transitions.");
    expect(row.find("button").text()).toBe("Toggle");

    const table = mount(DataTable, {
      props: { label: "Deleted items" },
      slots: { default: '<div role="row">Row</div>' },
    });
    expect(table.attributes("role")).toBe("table");
    expect(table.attributes("aria-label")).toBe("Deleted items");
    expect(table.classes()).toContain("ds-kit-data-table--plain");

    const lined = mount(DataTable, { props: { label: "Recent files", variant: "lined" } });
    expect(lined.classes()).toContain("ds-kit-data-table--lined");
  });

  it("maps AppFrame safeArea modes onto inset classes", () => {
    const def = mount(AppFrame);
    expect(def.classes()).toContain("ds-kit-app-frame--safe-bottom");
    expect(def.classes()).toContain("ds-kit-app-frame--safe-x");
    expect(def.classes()).not.toContain("ds-kit-app-frame--safe-top");

    const all = mount(AppFrame, { props: { safeArea: "all" } });
    expect(all.classes()).toContain("ds-kit-app-frame--safe-top");
    expect(all.classes()).toContain("ds-kit-app-frame--safe-bottom");
    expect(all.classes()).toContain("ds-kit-app-frame--safe-x");

    const bottom = mount(AppFrame, { props: { safeArea: "bottom" } });
    expect(bottom.classes()).toContain("ds-kit-app-frame--safe-bottom");
    expect(bottom.classes()).not.toContain("ds-kit-app-frame--safe-x");

    const none = mount(AppFrame, { props: { safeArea: false } });
    expect(none.classes()).not.toContain("ds-kit-app-frame--safe-bottom");
    expect(none.classes()).not.toContain("ds-kit-app-frame--safe-x");
    expect(none.classes()).not.toContain("ds-kit-app-frame--safe-top");
  });

  it("renders ScrollArea axis and safe-area classes", () => {
    const vertical = mount(ScrollArea, { slots: { default: "Body" } });
    expect(vertical.classes()).toContain("ds-kit-scroll-area--vertical");
    expect(vertical.classes()).not.toContain("ds-kit-scroll-area--safe-area");
    expect(vertical.text()).toBe("Body");
    expect((vertical.vm as { element: Element | null }).element).toBe(vertical.element);

    const horizontal = mount(ScrollArea, { props: { axis: "horizontal", safeArea: true } });
    expect(horizontal.classes()).toContain("ds-kit-scroll-area--horizontal");
    expect(horizontal.classes()).toContain("ds-kit-scroll-area--safe-area");
  });

  it("renders Separator with separator semantics", () => {
    const sep = mount(Separator, { props: { orientation: "vertical" } });
    expect(sep.attributes("role")).toBe("separator");
    expect(sep.attributes("aria-orientation")).toBe("vertical");
    expect(sep.classes()).toContain("ds-kit-separator--vertical");

    const decorative = mount(Separator, { props: { decorative: true } });
    expect(decorative.attributes("role")).toBeUndefined();
  });

  it("renders Spinner with status role and size", () => {
    const spinner = mount(Spinner, { props: { size: "lg", label: "Fetching" } });
    expect(spinner.attributes("role")).toBe("status");
    expect(spinner.attributes("aria-label")).toBe("Fetching");
    expect(spinner.classes()).toContain("ds-kit-spinner--lg");
  });

  it("emits Checkbox model updates and renders its label", async () => {
    const wrapper = mount(Checkbox, { props: { modelValue: false }, slots: { default: "Accept" } });
    expect(wrapper.text()).toContain("Accept");

    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).checked).toBe(false);
    await input.setValue(true);
    expect(wrapper.emitted("update:modelValue")).toEqual([[true]]);
  });

  it("renders ToolbarTitle and GroupLabel", () => {
    const title = mount(ToolbarTitle, { props: { title: "Document", subtitle: "Draft" } });
    expect(title.text()).toContain("Document");
    expect(title.text()).toContain("Draft");

    const label = mount(GroupLabel, { slots: { default: "Appearance" } });
    expect(label.classes()).toContain("ds-kit-group-label");
    expect(label.text()).toBe("Appearance");
  });

  it("renders ChoiceCard radio semantics, emits select, and ChoiceGrid groups them", async () => {
    const card = mount(ChoiceCard, {
      props: { selected: true, title: "Light", description: "Bright" },
    });
    expect(card.attributes("role")).toBe("radio");
    expect(card.attributes("aria-checked")).toBe("true");
    expect(card.text()).toContain("Light");
    expect(card.text()).toContain("Bright");
    await card.trigger("click");
    expect(card.emitted("select")).toHaveLength(1);

    const grid = mount(ChoiceGrid, { props: { label: "Theme" }, slots: { default: "cards" } });
    expect(grid.attributes("role")).toBe("radiogroup");
    expect(grid.attributes("aria-label")).toBe("Theme");
  });

  it("applies the SectionHeader page size", () => {
    const page = mount(SectionHeader, { props: { title: "General", size: "page" } });
    expect(page.classes()).toContain("ds-kit-section-header--page");
  });
});

describe("useAppChrome", () => {
  it("pushes a reactive title to the shell chrome and clears on unmount", async () => {
    const titles: Array<string | null> = [];
    const backs: Array<AppChromeBackAction | null> = [];
    const titlebars: Array<AppChromeTitlebarVisibility | null> = [];
    const contentSizes: Array<AppChromeContentSize | null> = [];
    const controller: AppChromeController = {
      setTitle: (title) => titles.push(title),
      setBackAction: (action) => backs.push(action),
      setTitlebar: (visibility) => titlebars.push(visibility),
      setContentSize: (size) => contentSizes.push(size),
      hide: () => {},
      close: () => {},
    };

    const Harness = defineComponent({
      props: {
        title: { type: String, default: "" },
        titlebar: { type: String, default: "visible" },
        contentWidth: { type: Number, default: 320 },
      },
      setup(props) {
        const chrome = useAppChrome({
          title: () => props.title,
          titlebar: () => props.titlebar as AppChromeTitlebarVisibility,
          contentSize: () => ({ width: props.contentWidth, height: 180 }),
        });
        return { available: chrome.available };
      },
      template: "<div />",
    });

    const wrapper = mount(Harness, {
      props: { title: "Inbox" },
      global: { provide: { [AppChromeInjectionKey as symbol]: controller } },
    });

    expect((wrapper.vm as { available: boolean }).available).toBe(true);
    expect(titles).toContain("Inbox");

    await wrapper.setProps({ title: "Drafts" });
    expect(titles).toContain("Drafts");

    await wrapper.setProps({ titlebar: "hidden" });
    expect(titlebars).toContain("hidden");

    await wrapper.setProps({ contentWidth: 640 });
    expect(contentSizes).toContainEqual({ width: 640, height: 180 });

    wrapper.unmount();
    expect(titles.at(-1)).toBeNull();
    expect(backs.at(-1)).toBeNull();
    expect(titlebars.at(-1)).toBeNull();
    expect(contentSizes.at(-1)).toBeNull();
  });

  it("forwards imperative setters and app actions through the injected controller", () => {
    const backs: Array<AppChromeBackAction | null> = [];
    const titlebars: Array<AppChromeTitlebarVisibility | null> = [];
    const contentSizes: Array<AppChromeContentSize | null> = [];
    let hides = 0;
    let closes = 0;
    const controller: AppChromeController = {
      setTitle: () => {},
      setBackAction: (action) => backs.push(action),
      setTitlebar: (visibility) => titlebars.push(visibility),
      setContentSize: (size) => contentSizes.push(size),
      hide: () => {
        hides += 1;
      },
      close: () => {
        closes += 1;
      },
    };
    const action: AppChromeBackAction = { ariaLabel: "Back", handler: () => {} };

    const Harness = defineComponent({
      setup() {
        const chrome = useAppChrome();
        chrome.setBackAction(action);
        chrome.setTitlebar("hidden");
        chrome.setContentSize({ width: 640, height: 360 });
        chrome.hide();
        chrome.close();
        return {};
      },
      template: "<div />",
    });

    mount(Harness, { global: { provide: { [AppChromeInjectionKey as symbol]: controller } } });
    expect(backs).toContainEqual(action);
    expect(titlebars).toContain("hidden");
    expect(contentSizes).toContainEqual({ width: 640, height: 360 });
    expect(hides).toBe(1);
    expect(closes).toBe(1);
  });

  it("no-ops on shells that do not provide app chrome", () => {
    const Harness = defineComponent({
      setup() {
        const chrome = useAppChrome();
        chrome.setTitle("Ignored");
        chrome.setBackAction({ ariaLabel: "Back", handler: () => {} });
        chrome.setTitlebar("hidden");
        chrome.setContentSize({ width: 640, height: 360 });
        chrome.hide();
        chrome.close();
        return { available: chrome.available };
      },
      template: "<div />",
    });

    const wrapper = mount(Harness);
    expect((wrapper.vm as { available: boolean }).available).toBe(false);
    expect(() => wrapper.unmount()).not.toThrow();
  });
});
