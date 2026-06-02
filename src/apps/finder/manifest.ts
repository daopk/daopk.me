import type { AppManifest } from "@daopk/sdk";

import { FinderAppIcon } from "~/icons/fluentColor";

export const finderManifest: AppManifest = {
  id: "finder",
  name: "Finder",
  version: "1.0.0",
  icon: FinderAppIcon,
  category: "system",
  singleton: true,
  permissions: ["vfs.read", "vfs.write"],
  defaultWindow: { width: 860, height: 560, centered: true },
  component: () => import("./App.vue"),
  keywords: ["files", "browser", "vfs", "folder", "documents"],
};
