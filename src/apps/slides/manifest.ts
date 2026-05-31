import { SlidesAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const slidesManifest: AppManifest = {
  id: "slides",
  name: "Slides",
  icon: SlidesAppIcon,
  category: "productivity",
  singleton: true,
  supportedShells: ["desktop"],
  permissions: ["vfs.read", "vfs.write", "network.fetch"],
  defaultWindow: { width: 1120, height: 720, centered: true },
  component: () => import("./App.vue"),
  keywords: ["slides", "slidev", "deck", "presentation", "markdown", "vfs"],
};
