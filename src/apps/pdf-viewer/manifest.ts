import { PdfViewerAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const pdfViewerManifest: AppManifest = {
  id: "pdf-viewer",
  name: "PDF Viewer",
  icon: PdfViewerAppIcon,
  category: "productivity",
  singleton: false,
  permissions: ["vfs.read"],
  defaultWindow: { width: 1040, height: 720, centered: true },
  component: () => import("./App.vue"),
  keywords: ["pdf", "document", "reader", "viewer", "vfs"],
};
