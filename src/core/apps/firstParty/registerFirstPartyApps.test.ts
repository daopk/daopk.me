import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineAsyncComponent, defineComponent, h, nextTick, type Component } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

import type { AppManifest } from "~/types/app";
import type { Kernel, KernelAppsRegisterOptions } from "~/types/kernel";

import type { FirstPartyCatalogAppManifest } from "./types";

vi.mock("~/core/debug", () => ({ debugWarn: vi.fn(), debugLog: vi.fn() }));

vi.mock("./registry", () => {
  const ids = ["notes"];
  return {
    FIRST_PARTY_APP_ID_LIST: ids,
    FIRST_PARTY_APP_IDS: new Set(ids),
    isFirstPartyAppId: (id: string) => ids.includes(id),
  };
});

vi.mock("./devManifests", () => ({
  FIRST_PARTY_DEV_CATALOG_ENTRIES: [
    {
      id: "notes",
      version: "1.0.1",
      build: 0,
      entry: "/public/apps/notes/1.0.1+0/notes.js",
      manifest: {
        id: "notes",
        name: "Notes",
        icon: "NotesAppIcon",
        category: "productivity",
        widgets: [
          {
            id: "notes.recent",
            title: "Recent Notes",
            surface: "desktop:wallpaper",
            size: "md",
            exportName: "RecentNotesWidget",
          },
        ],
        previews: [
          {
            id: "notes:preview",
            title: "Note Preview",
            surfaces: ["finder.panel"],
            exportName: "NotePreview",
            match: "pdf-file",
          },
        ],
        desktop: {
          contextMenu: [
            {
              id: "notes:new-desktop-note",
              label: "New Note",
              surface: "desktop:background",
              exportName: "createDesktopNote",
            },
          ],
          renderers: [
            {
              id: "notes:desktop-layer",
              surface: "desktop:wallpaper",
              exportName: "NotesDesktopLayer",
            },
          ],
        },
      },
    },
  ],
}));

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
          NotePreview: dc({
            name: "NotePreview",
            template: '<div class="preview-stub">preview content</div>',
          }),
          createDesktopNote: vi.fn(),
          NotesDesktopLayer: dc({
            name: "NotesDesktopLayer",
            template: '<div class="desktop-layer-stub">desktop layer</div>',
          }),
        }),
    },
  };
});

import {
  firstPartyCatalogEntryToAppManifest,
  firstPartyCatalogManifestToAppManifest,
  registerFirstPartyApps,
} from "./registerFirstPartyApps";

function fakeKernel(
  registered: Array<{ manifest: AppManifest; options?: KernelAppsRegisterOptions }>,
): Kernel {
  return {
    apps: {
      list: () => registered.map((entry) => entry.manifest),
      register: (manifest: AppManifest, options?: KernelAppsRegisterOptions) => {
        registered.push({ manifest, options });
      },
      launch: vi.fn(),
      unregister: vi.fn(),
    },
  } as unknown as Kernel;
}

/**
 * Drive a manifest/widget `component` loader through `defineAsyncComponent` —
 * the exact path `AppMount` and every widget surface use — and return the
 * resolved HTML.
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
  let registered: Array<{ manifest: AppManifest; options?: KernelAppsRegisterOptions }>;

  beforeEach(async () => {
    registered = [];
    await registerFirstPartyApps(fakeKernel(registered));
  });

  it("registers dev catalog apps as external apps", () => {
    expect(registered).toHaveLength(1);
    expect(registered[0].manifest.id).toBe("notes");
    expect(registered[0].manifest.version).toBe("1.0.1");
    expect(registered[0].options).toEqual({ source: "external" });
  });

  it("builds an app loader that defineAsyncComponent unwraps to the default export", async () => {
    const manifest = registered.find((entry) => entry.manifest.id === "notes")?.manifest;
    expect(manifest).toBeDefined();

    const resolved = await manifest!.component();
    expect((resolved as { __esModule?: boolean }).__esModule).toBe(true);

    expect(await renderViaAsyncComponent(manifest!.component)).toContain("app-root-stub");
  });

  it("builds widget, preview, and desktop contribution loaders from named exports", async () => {
    const manifest = registered.find((entry) => entry.manifest.id === "notes")?.manifest;
    const widget = manifest?.widgets?.[0];
    const preview = manifest?.previews?.[0];
    const contextMenuItem = manifest?.desktop?.contextMenu?.[0];
    const renderer = manifest?.desktop?.renderers?.[0];
    expect(widget).toBeDefined();
    expect(preview).toBeDefined();
    expect(contextMenuItem).toBeDefined();
    expect(renderer).toBeDefined();

    expect(((await widget!.component()) as { __esModule?: boolean }).__esModule).toBe(true);
    expect(await renderViaAsyncComponent(widget!.component)).toContain("widget-stub");

    expect(preview?.manifestId).toBe("notes");
    expect(((await preview!.component()) as { __esModule?: boolean }).__esModule).toBe(true);
    expect(await renderViaAsyncComponent(preview!.component)).toContain("preview-stub");

    expect(typeof (await contextMenuItem!.action())).toBe("function");
    expect(((await renderer!.component()) as { __esModule?: boolean }).__esModule).toBe(true);
    expect(await renderViaAsyncComponent(renderer!.component)).toContain("desktop layer");
  });

  it("reuses the manifest builder with ESM-wrapped app and widget loaders", async () => {
    const catalogManifest: FirstPartyCatalogAppManifest = {
      id: "probe",
      name: "Probe",
      icon: "NotesAppIcon",
      category: "dev",
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
      previews: [
        {
          id: "probe:preview",
          title: "Probe Preview",
          surfaces: ["finder.panel"],
          exportName: "ProbePreview",
          match: "pdf-file",
        },
      ],
      desktop: {
        contextMenu: [
          {
            id: "probe:new",
            label: "New Probe",
            surface: "desktop:background",
            exportName: "createProbe",
          },
        ],
        renderers: [
          {
            id: "probe:desktop-layer",
            surface: "desktop:wallpaper",
            exportName: "ProbeDesktopLayer",
          },
        ],
      },
    };
    const createProbe = vi.fn();
    const manifest = firstPartyCatalogManifestToAppManifest(
      catalogManifest,
      async () => ({
        default: defineComponent({
          name: "ProbeApp",
          template: '<div class="probe-app">probe app</div>',
        }),
        ProbeWidget: defineComponent({
          name: "ProbeWidget",
          template: '<div class="probe-widget">probe widget</div>',
        }),
        ProbePreview: defineComponent({
          name: "ProbePreview",
          template: '<div class="probe-preview">probe preview</div>',
        }),
        createProbe,
        ProbeDesktopLayer: defineComponent({
          name: "ProbeDesktopLayer",
          template: '<div class="probe-desktop-layer">probe desktop</div>',
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

    const preview = manifest.previews?.[0];
    expect(preview).toBeDefined();
    expect(preview?.manifestId).toBe("probe");
    expect(((await preview!.component()) as { __esModule?: boolean }).__esModule).toBe(true);
    expect(await renderViaAsyncComponent(preview!.component)).toContain("probe-preview");

    const contextMenuItem = manifest.desktop?.contextMenu?.[0];
    expect(contextMenuItem).toBeDefined();
    expect(await contextMenuItem!.action()).toBe(createProbe);

    const renderer = manifest.desktop?.renderers?.[0];
    expect(renderer).toBeDefined();
    expect(((await renderer!.component()) as { __esModule?: boolean }).__esModule).toBe(true);
    expect(await renderViaAsyncComponent(renderer!.component)).toContain("probe desktop");
  });

  it("carries catalog build metadata into the runtime manifest", () => {
    const manifest = firstPartyCatalogEntryToAppManifest({
      id: "notes",
      version: "1.2.3",
      build: 42,
      revision: "abc1234",
      entry: "/public/apps/notes/1.2.3+42/notes.js",
      manifest: {
        id: "notes",
        name: "Notes",
        icon: "NotesAppIcon",
        category: "productivity",
      },
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

  it("skips legacy catalog entries that do not carry a manifest", () => {
    expect(
      firstPartyCatalogEntryToAppManifest({
        id: "notes",
        version: "1.2.3",
        build: 42,
        entry: "/public/apps/notes/1.2.3+42/notes.js",
      }),
    ).toBeNull();
  });
});
