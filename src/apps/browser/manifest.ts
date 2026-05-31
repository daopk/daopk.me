import { BrowserAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const browserManifest: AppManifest = {
  id: "browser",
  name: "Browser",
  version: "1.0.0",
  icon: BrowserAppIcon,
  category: "productivity",
  singleton: false,
  defaultWindow: { width: 980, height: 640, centered: true },
  component: () => import("./App.vue"),
  keywords: ["web", "internet", "browser", "url", "site", "iframe"],
};
