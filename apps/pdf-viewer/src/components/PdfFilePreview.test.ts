import { describe, expect, it, vi } from "vitest";

import { mountVapor } from "~/test/mountVapor";

import {
  AppContextInjectionKey,
  KernelInjectionKey,
  type AppContext,
  type Kernel,
} from "@daopk/sdk";

import { usePdfViewer } from "../usePdfViewer";
import PdfFilePreview from "./PdfFilePreview.vue";

vi.mock("../usePdfViewer", async () => {
  const { ref } = await import("vue");
  return {
    usePdfViewer: vi.fn(() => ({
      canvasEl: ref(null),
      viewportEl: ref(null),
      status: ref("ready"),
      pageCount: ref(1),
      message: ref("Loaded demo.pdf."),
      error: ref(""),
      loadFromPath: vi.fn(),
    })),
  };
});

const context: AppContext = Object.freeze({
  manifestId: "finder",
  handleId: "finder-handle",
  args: Object.freeze({}),
});

function makeKernel(): Kernel {
  return {
    vfs: {
      stat: vi.fn(),
      list: vi.fn(),
      read: vi.fn(),
      readText: vi.fn(),
      write: vi.fn(),
      writeText: vi.fn(),
      mkdir: vi.fn(),
      remove: vi.fn(),
    },
  } as unknown as Kernel;
}

describe("PdfFilePreview", () => {
  it("initializes the PDF viewer from a VFS file preview input", () => {
    const wrapper = mountVapor(PdfFilePreview, {
      props: {
        input: {
          kind: "vfs-file",
          entry: {
            kind: "file",
            name: "demo.pdf",
            path: "/home/demo.pdf",
            size: 123,
            updatedAt: 0,
            readonly: false,
            mimeType: "application/pdf",
          },
        },
        args: { path: "/home/demo.pdf" },
        surface: "finder.panel",
      },
      provide: [
        [KernelInjectionKey, makeKernel()],
        [AppContextInjectionKey, context],
      ],
    });

    expect(usePdfViewer).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPath: "/home/demo.pdf",
      }),
    );
    expect(wrapper.find(".pdf-file-preview").getAttribute("data-preview-surface")).toBe(
      "finder.panel",
    );
    wrapper.unmount();
  });
});
