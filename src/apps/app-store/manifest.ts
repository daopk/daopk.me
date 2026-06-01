import { AppStoreAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const appStoreManifest: AppManifest = {
  id: "app-store",
  name: "App Store",
  version: "1.0.0",
  icon: AppStoreAppIcon,
  category: "productivity",
  defaultWindow: { width: 720, height: 560, centered: true },
  singleton: true,
  component: () => import("./App.vue"),
  keywords: ["app", "store", "first party", "catalog", "marketplace"],
};
