import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAsyncComponent, defineComponent, h, nextTick, type Component } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

// A single rostered app whose published module exposes the app component as
// `default` plus a named widget export — exactly the shape a real
// `import("@daopk-app/<id>")` produces. Components are created inside the mock
// factories to dodge the `vi.mock` hoisting trap (factories run before
// top-level consts initialise).
vi.mock("./registry", async () => {
  const { defineComponent: dc } = await import("vue");
  return {
    FIRST_PARTY_APPS: [
      {
        id: "notes",
        name: "Notes",
        icon: dc({ name: "StubIcon", template: "<svg />" }),
        category: "productivity",
        version: "0.0.0-dev",
        widgets: [
          {
            id: "notes.recent",
            title: "Recent Notes",
            surface: "desktop:wallpaper",
            size: "md",
            exportName: "RecentNotesWidget",
          },
        ],
      },
    ],
  };
});

vi.mock("./devEntries", async () => {
  const { defineComponent: dc } = await import("vue");
  return {
    FIRST_PARTY_DEV_ENTRIES: {
      notes: () =>
        Promise.resolve({
          default: dc({ name: "AppRoot", template: '<div class="app-root-stub">app content</div>' }),
          RecentNotesWidget: dc({
            name: "RecentNotesWidget",
            template: '<div class="widget-stub">widget content</div>',
          }),
        }),
    },
  };
});

import { registerFirstPartyApps } from "./registerFirstPartyApps";

function fakeKernel(registered: AppManifest[]): Kernel {
  return {
    apps: {
      list: () => registered,
      register: (manifest: AppManifest) => {
        registered.push(manifest);
      },
      launch: vi.fn(),
      unregister: vi.fn(),
    },
  } as unknown as Kernel;
}

/**
 * Drive a manifest/widget `component` loader through `defineAsyncComponent` —
 * the exact path `AppMount` and every widget surface use — and return the
 * resolved HTML. This reproduces the production failure mode: a loader that
 * resolves to a plain `{ default }` object (missing the ESM flag) is treated
 * as the component itself and renders an empty comment instead of the app.
 */
async function renderViaAsyncComponent(
  loader: () => Promise<{ default: Component }>,
): Promise<string> {
  const asyncComponent = defineAsyncComponent({ loader, delay: 0 });
  const wrapper = mount(defineComponent({ name: "Probe", render: () => h(asyncComponent) }));
  await flushPromises();
  await nextTick();
  return wrapper.html();
}

describe("registerFirstPartyApps (dev lane)", () => {
  let registered: AppManifest[];

  beforeEach(async () => {
    registered = [];
    await registerFirstPartyApps(fakeKernel(registered));
  });

  it("builds an app loader that defineAsyncComponent unwraps to the default export", async () => {
    const manifest = registered.find((entry) => entry.id === "notes");
    expect(manifest).toBeDefined();

    // Regression guard: the resolved record must be ESM-flagged so Vue unwraps
    // `.default`. A bare `{ default }` object silently renders nothing in prod.
    const resolved = await manifest!.component();
    expect((resolved as { __esModule?: boolean }).__esModule).toBe(true);

    expect(await renderViaAsyncComponent(manifest!.component)).toContain("app-root-stub");
  });

  it("builds a widget loader from the named export, also ESM-unwrappable", async () => {
    const widget = registered.find((entry) => entry.id === "notes")?.widgets?.[0];
    expect(widget).toBeDefined();

    const resolved = await widget!.component();
    expect((resolved as { __esModule?: boolean }).__esModule).toBe(true);

    expect(await renderViaAsyncComponent(widget!.component)).toContain("widget-stub");
  });
});
