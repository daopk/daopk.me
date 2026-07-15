import { describe, expect, it, vi } from "vitest";

import { mountVapor } from "~/test/mountVapor";

import NotesDesktopLayer from "./NotesDesktopLayer.vue";

const pinnedNotesMocks = vi.hoisted(() => ({
  hydrate: vi.fn(),
  isHydrated: vi.fn(() => false),
  unpin: vi.fn(),
}));

vi.mock("./usePinnedDesktopNotes", async () => {
  const { ref } = await import("vue");

  return {
    usePinnedDesktopNotes: () => ({
      notes: ref([
        {
          path: "/home/demo.md",
          x: 24,
          y: 32,
          z: 1,
          color: "yellow",
        },
      ]),
      ...pinnedNotesMocks,
    }),
  };
});

vi.mock("./DesktopStickyNote.vue", async () => {
  const { defineComponent, h } = await import("vue");

  return {
    default: defineComponent({
      name: "DesktopStickyNoteStub",
      props: {
        note: {
          type: Object,
          required: true,
        },
        stageSize: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        return () =>
          h(
            "article",
            { class: "desktop-sticky-note-stub" },
            String((props.note as { path: string }).path),
          );
      },
    }),
  };
});

describe("NotesDesktopLayer", () => {
  it("hydrates pinned notes and renders VDOM note children through interop", () => {
    const wrapper = mountVapor(NotesDesktopLayer, {
      props: {
        stageSize: { width: 1280, height: 720 },
      },
    });

    expect(pinnedNotesMocks.hydrate).toHaveBeenCalledOnce();
    expect(wrapper.find(".notes-desktop-layer").getAttribute("aria-label")).toBe("Pinned notes");
    expect(wrapper.find(".desktop-sticky-note-stub").textContent).toBe("/home/demo.md");
    wrapper.unmount();
  });
});
