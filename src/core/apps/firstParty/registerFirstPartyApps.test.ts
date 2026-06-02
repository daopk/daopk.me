import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAsyncComponent, defineComponent, h, nextTick, type Component } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

import type { AppManifest } from "~/types/app";
import type { Kernel } from "~/types/kernel";

import type { FirstPartyAppDescriptor } from "./types";

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
          default: dc({
            name: "AppRoot",
            template: '<div class="app-root-stub">app content</div>',
          }),
          RecentNotesWidget: dc({
            name: "RecentNotesWidget",
            template: '<div class="widget-stub">widget content</div>',
          }),
        }),
    },
  };
});

import {
  firstPartyCatalogEntryToAppManifest,
  firstPartyDescriptorToAppManifest,
  registerFirstPartyApps,
} from "./registerFirstPartyApps";

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

  it("reuses the manifest builder with ESM-wrapped app and widget loaders", async () => {
    const descriptor: FirstPartyAppDescriptor = {
      id: "probe",
      name: "Probe",
      icon: defineComponent({ name: "ProbeIcon", template: "<svg />" }),
      category: "dev",
      version: "0.0.0",
      chrome: { mobile: { titlebar: "hidden" } },
      widgets: [
        {
          id: "probe:widget",
          title: "Probe Widget",
          surface: "desktop:wallpaper",
          size: "sm",
          exportName: "ProbeWidget",
        },
      ],
    };
    const manifest = firstPartyDescriptorToAppManifest(
      descriptor,
      async () => ({
        default: defineComponent({
          name: "ProbeApp",
          template: '<div class="probe-app">probe app</div>',
        }),
        ProbeWidget: defineComponent({
          name: "ProbeWidget",
          template: '<div class="probe-widget">probe widget</div>',
        }),
      }),
      "1.2.3",
      42,
      "abc1234",
    );

    expect(manifest.version).toBe("1.2.3");
    expect(manifest.build).toBe(42);
    expect(manifest.revision).toBe("abc1234");
    expect(manifest.chrome).toEqual({ mobile: { titlebar: "hidden" } });
    expect(((await manifest.component()) as { __esModule?: boolean }).__esModule).toBe(true);
    expect(await renderViaAsyncComponent(manifest.component)).toContain("probe-app");

    const widget = manifest.widgets?.[0];
    expect(widget).toBeDefined();
    expect(((await widget!.component()) as { __esModule?: boolean }).__esModule).toBe(true);
    expect(await renderViaAsyncComponent(widget!.component)).toContain("probe-widget");
  });

  it("carries catalog build metadata into the runtime manifest", () => {
    const manifest = firstPartyCatalogEntryToAppManifest({
      id: "notes",
      version: "1.2.3",
      build: 42,
      revision: "abc1234",
      entry: "/apps/notes/1.2.3+42/notes.js",
    });

    expect(manifest).toEqual(
      expect.objectContaining({
        id: "notes",
        version: "1.2.3",
        build: 42,
        revision: "abc1234",
      }),
    );
  });
});
