import { mount, type VueWrapper } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, type Component } from "vue";

import Spotlight from "~/components/spotlight/Spotlight.vue";
import type { SpotlightRecentEntry } from "~/core/spotlight/SpotlightRecentsStore";
import type { AppManifest } from "~/types/app";
import type { CommandManifest } from "~/types/command";
import type { Kernel } from "~/types/kernel";
import type { SearchHit } from "~/types/search";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

vi.mock("~/composables/useReducedMotion", () => ({
  useReducedMotion: () => ({ reduced: { value: false } }),
}));

const StubIcon = defineComponent({ template: "<svg />" });

let currentApps: AppManifest[] = [];
let currentCommands: CommandManifest[] = [];

vi.mock("~/composables/useKernel", () => ({
  useKernel(): Pick<Kernel, "apps" | "commands"> {
    return {
      apps: {
        list: () => currentApps,
        register: vi.fn(),
        launch: vi.fn(),
        unregister: vi.fn(),
      },
      commands: {
        list: () => currentCommands,
        register: vi.fn(),
        unregister: vi.fn(),
        dispatch: vi.fn(),
      },
    };
  },
}));

function appManifest(id: string, overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    icon: StubIcon as Component,
    category: "system",
    component: () => Promise.resolve({ default: defineComponent({ template: "<div />" }) }),
    ...overrides,
  };
}

function commandManifest(id: string, overrides: Partial<CommandManifest> = {}): CommandManifest {
  return {
    id,
    title: id.replace(/[:_-]/g, " "),
    run: vi.fn(),
    ...overrides,
  };
}

function makeSpotlight(props: {
  query?: string;
  hits?: ReadonlyArray<SearchHit>;
  recents?: ReadonlyArray<SpotlightRecentEntry>;
}): VueWrapper {
  return mount(Spotlight, {
    props: {
      query: props.query ?? "",
      hits: props.hits ?? [],
      recents: props.recents ?? [],
    },
    attachTo: document.body,
  });
}

describe("Spotlight.vue", () => {
  beforeEach(() => {
    currentApps = [
      appManifest("settings"),
      appManifest("terminal"),
      appManifest("about", { name: "About" }),
    ];
    currentCommands = [
      commandManifest("finder:open", { title: "Open Finder" }),
      commandManifest("theme:toggle", { title: "Toggle Theme", hint: "Light ↔ Dark" }),
    ];
  });

  describe("a11y wiring", () => {
    it("moves initial focus into the search input", async () => {
      const w = makeSpotlight({});
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(document.activeElement).toBe(w.get('input[role="combobox"]').element);
      w.unmount();
    });

    it("exposes role=dialog + aria-modal=true + aria-labelledby on the panel", () => {
      const w = makeSpotlight({});
      const dialog = w.find('[role="dialog"]');
      expect(dialog.exists()).toBe(true);
      expect(dialog.attributes("aria-modal")).toBe("true");
      expect(dialog.attributes("aria-labelledby")).toBeTruthy();
      w.unmount();
    });

    it("input is role=combobox with aria-autocomplete=list", () => {
      const w = makeSpotlight({});
      const input = w.find('input[role="combobox"]');
      expect(input.exists()).toBe(true);
      expect(input.attributes("aria-autocomplete")).toBe("list");
      w.unmount();
    });

    it("aria-controls is omitted when the listbox is empty (no dangling id)", () => {
      const w = makeSpotlight({ query: "no-match", hits: [] });
      const input = w.find('input[role="combobox"]');
      expect(input.attributes("aria-controls")).toBeUndefined();
      expect(input.attributes("aria-expanded")).toBe("false");
      w.unmount();
    });

    it("aria-controls points to the listbox id when rows render", () => {
      const w = makeSpotlight({
        query: "settings",
        hits: [{ kind: "app", id: "settings", title: "Settings", score: 1 }],
      });
      const input = w.find('input[role="combobox"]');
      const listbox = w.find('[role="listbox"]');
      expect(listbox.exists()).toBe(true);
      expect(input.attributes("aria-controls")).toBe(listbox.attributes("id"));
      expect(input.attributes("aria-expanded")).toBe("true");
      w.unmount();
    });

    it("first row is aria-selected and aria-activedescendant points to it", () => {
      const w = makeSpotlight({
        query: "s",
        hits: [
          { kind: "app", id: "settings", title: "Settings", score: 2 },
          { kind: "command", id: "finder:open", title: "Open Finder", score: 1 },
        ],
      });
      const options = w.findAll('[role="option"]');
      expect(options.length).toBe(2);
      expect(options[0]?.attributes("aria-selected")).toBe("true");
      expect(options[1]?.attributes("aria-selected")).toBe("false");

      const input = w.find('input[role="combobox"]');
      expect(input.attributes("aria-activedescendant")).toBe(options[0]?.attributes("id"));
      w.unmount();
    });
  });

  describe("rendering forks", () => {
    it("empty query + no recents → 'Start typing to search' empty state", () => {
      const w = makeSpotlight({});
      expect(w.text()).toContain("Start typing to search");
      expect(w.find('[role="listbox"]').exists()).toBe(false);
      w.unmount();
    });

    it("non-empty query + no hits → 'No results' empty state", () => {
      const w = makeSpotlight({ query: "zzz", hits: [] });
      expect(w.text()).toContain("No results");
      expect(w.find('[role="listbox"]').exists()).toBe(false);
      w.unmount();
    });

    it("empty query + recents → renders Recent section header", () => {
      const w = makeSpotlight({
        query: "",
        recents: [
          { kind: "app", id: "settings", usedAt: 100 },
          { kind: "command", id: "finder:open", usedAt: 90 },
        ],
      });
      expect(w.text()).toContain("Recent");
      const options = w.findAll('[role="option"]');
      expect(options.length).toBe(2);
      w.unmount();
    });

    it("non-empty query → groups Apps before Commands with section labels", () => {
      const w = makeSpotlight({
        query: "settings",
        hits: [
          { kind: "command", id: "finder:open", title: "Open Finder", score: 1 },
          { kind: "app", id: "settings", title: "Settings", score: 2 },
          { kind: "app", id: "terminal", title: "Terminal", score: 1 },
        ],
      });
      const text = w.text();
      const appsIdx = text.indexOf("Apps");
      const cmdsIdx = text.indexOf("Commands");
      expect(appsIdx).toBeGreaterThan(-1);
      expect(cmdsIdx).toBeGreaterThan(-1);
      expect(appsIdx).toBeLessThan(cmdsIdx);
      w.unmount();
    });

    it("non-empty query → groups VFS hits between Apps and Commands", () => {
      const w = makeSpotlight({
        query: "field",
        hits: [
          { kind: "command", id: "finder:open", title: "Open Finder", score: 1 },
          {
            kind: "vfs",
            id: "/portfolio/posts/field-notes.md",
            title: "Field Notes",
            hint: "/portfolio/posts/field-notes.md",
            score: 2,
            vfs: {
              path: "/portfolio/posts/field-notes.md",
              entryKind: "file",
              mimeType: "text/markdown",
              snippet: "Field notes keep content searchable across the runtime surface.",
            },
          },
          { kind: "app", id: "settings", title: "Settings", score: 3 },
        ],
      });
      const text = w.text();
      const appsIdx = text.indexOf("Apps");
      const filesIdx = text.indexOf("Files");
      const cmdsIdx = text.indexOf("Commands");

      expect(appsIdx).toBeGreaterThan(-1);
      expect(filesIdx).toBeGreaterThan(-1);
      expect(cmdsIdx).toBeGreaterThan(-1);
      expect(appsIdx).toBeLessThan(filesIdx);
      expect(filesIdx).toBeLessThan(cmdsIdx);
      expect(text).toContain("Field notes keep content searchable across the runtime surface.");
      w.unmount();
    });

    it("skips rows whose manifest is unregistered (resolveAsRow returns null)", () => {
      const w = makeSpotlight({
        query: "x",
        hits: [
          { kind: "app", id: "settings", title: "Settings", score: 1 },
          { kind: "app", id: "GHOST_APP", title: "Ghost", score: 1 },
        ],
      });
      const options = w.findAll('[role="option"]');
      expect(options.length).toBe(1);
      w.unmount();
    });
  });

  describe("keyboard navigation", () => {
    function makeNavSpotlight(): VueWrapper {
      return makeSpotlight({
        query: "x",
        hits: [
          { kind: "app", id: "settings", title: "Settings", score: 3 },
          { kind: "app", id: "terminal", title: "Terminal", score: 2 },
          { kind: "command", id: "finder:open", title: "Open Finder", score: 1 },
        ],
      });
    }

    async function press(w: VueWrapper, key: string): Promise<void> {
      const dialog = w.find('[role="dialog"]');
      await dialog.trigger("keydown", { key });
    }

    it("ArrowDown moves activeIndex forward, ArrowUp moves it back", async () => {
      const w = makeNavSpotlight();
      const input = w.find('input[role="combobox"]');
      const options = w.findAll('[role="option"]');

      expect(input.attributes("aria-activedescendant")).toBe(options[0]?.attributes("id"));

      await press(w, "ArrowDown");
      expect(input.attributes("aria-activedescendant")).toBe(options[1]?.attributes("id"));

      await press(w, "ArrowDown");
      expect(input.attributes("aria-activedescendant")).toBe(options[2]?.attributes("id"));

      await press(w, "ArrowUp");
      expect(input.attributes("aria-activedescendant")).toBe(options[1]?.attributes("id"));

      w.unmount();
    });

    it("ArrowDown wraps from last to first (and ArrowUp wraps from first to last)", async () => {
      const w = makeNavSpotlight();
      const input = w.find('input[role="combobox"]');
      const options = w.findAll('[role="option"]');

      await press(w, "ArrowDown");
      await press(w, "ArrowDown");
      expect(input.attributes("aria-activedescendant")).toBe(options[2]?.attributes("id"));
      await press(w, "ArrowDown");
      expect(input.attributes("aria-activedescendant")).toBe(options[0]?.attributes("id"));

      await press(w, "ArrowUp");
      expect(input.attributes("aria-activedescendant")).toBe(options[2]?.attributes("id"));

      w.unmount();
    });

    it("Home jumps to first row, End jumps to last row", async () => {
      const w = makeNavSpotlight();
      const input = w.find('input[role="combobox"]');
      const options = w.findAll('[role="option"]');

      await press(w, "End");
      expect(input.attributes("aria-activedescendant")).toBe(options[2]?.attributes("id"));

      await press(w, "Home");
      expect(input.attributes("aria-activedescendant")).toBe(options[0]?.attributes("id"));

      w.unmount();
    });

    it("Enter dispatches the active row", async () => {
      const w = makeNavSpotlight();
      await press(w, "ArrowDown");
      await press(w, "Enter");

      expect(w.emitted("dispatch")).toEqual([[{ kind: "app", id: "terminal" }]]);
      w.unmount();
    });

    it("Escape emits close", async () => {
      const w = makeNavSpotlight();
      await press(w, "Escape");
      expect(w.emitted("close")).toBeTruthy();
      w.unmount();
    });
  });

  describe("mouse interactions", () => {
    it("clicking a row emits dispatch with the row's (kind, id)", async () => {
      const w = makeSpotlight({
        query: "x",
        hits: [
          { kind: "app", id: "settings", title: "Settings", score: 2 },
          { kind: "command", id: "finder:open", title: "Open Finder", score: 1 },
        ],
      });
      const options = w.findAll('[role="option"]');
      await options[1]?.trigger("mousedown");

      expect(w.emitted("dispatch")).toEqual([[{ kind: "command", id: "finder:open" }]]);
      w.unmount();
    });

    it("clicking a VFS row emits dispatch with kind=vfs", async () => {
      const w = makeSpotlight({
        query: "field",
        hits: [
          {
            kind: "vfs",
            id: "/portfolio/posts/field-notes.md",
            title: "Field Notes",
            score: 1,
            vfs: { path: "/portfolio/posts/field-notes.md", entryKind: "file" },
          },
        ],
      });
      await w.find('[role="option"]').trigger("mousedown");

      expect(w.emitted("dispatch")).toEqual([
        [{ kind: "vfs", id: "/portfolio/posts/field-notes.md" }],
      ]);
      w.unmount();
    });

    it("scrim mousedown emits close (target===currentTarget guard)", async () => {
      const w = makeSpotlight({});
      const scrim = w.find(".spotlight").element as HTMLElement;
      scrim.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await w.vm.$nextTick();
      expect(w.emitted("close")).toBeTruthy();
      w.unmount();
    });
  });

  describe("input two-way binding", () => {
    it("typing emits update:query", async () => {
      const w = makeSpotlight({});
      const input = w.find('input[role="combobox"]');
      (input.element as HTMLInputElement).value = "hello";
      await input.trigger("input");
      expect(w.emitted("update:query")).toEqual([["hello"]]);
      w.unmount();
    });
  });

  describe("activeIndex clamp", () => {
    it("aria-activedescendant cleared when rows.length transitions to 0", async () => {
      const w = makeSpotlight({
        query: "x",
        hits: [{ kind: "app", id: "settings", title: "Settings", score: 1 }],
      });
      const input = w.find('input[role="combobox"]');
      expect(input.attributes("aria-activedescendant")).toBeTruthy();

      await w.setProps({ query: "x", hits: [] });
      expect(input.attributes("aria-activedescendant")).toBeUndefined();
      expect(input.attributes("aria-controls")).toBeUndefined();
      w.unmount();
    });
  });
});
