import { BlogAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const blogManifest: AppManifest = {
  id: "blog",
  name: "Blog",
  version: "1.0.0",
  icon: BlogAppIcon,
  category: "system",
  permissions: ["vfs.read", "vfs.write", "network.fetch"],
  defaultWindow: { width: 720, height: 520, centered: true },
  component: () => import("./App.vue"),
  keywords: ["blog", "post", "writing", "article", "markdown"],
};
