import { describe, expect, it, vi } from "vitest";

import { mountVaporRoot } from "~/test/mountVapor";

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
  const { defineVaporComponent, renderEffect } = await import("vue");

  return {
    default: defineVaporComponent({
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
        const article = document.createElement("article");
        article.className = "desktop-sticky-note-stub";
        renderEffect(() => {
          article.textContent = String((props.note as { path: string }).path);
        });
        return article;
      },
    }),
  };
});

describe("NotesDesktopLayer", () => {
  it("hydrates pinned notes and renders Vapor note children", () => {
    const wrapper = mountVaporRoot(NotesDesktopLayer, {
      props: {
        stageSize: { width: 1280, height: 720 },
      },
    });

    expect(pinnedNotesMocks.hydrate).toHaveBeenCalledOnce();
    const layer = wrapper.find(".notes-desktop-layer");
    expect(layer.getAttribute("role")).toBe("region");
    expect(layer.getAttribute("aria-label")).toBe("Pinned notes");
    expect(wrapper.find(".desktop-sticky-note-stub").textContent).toBe("/home/demo.md");
    wrapper.unmount();
  });
});
