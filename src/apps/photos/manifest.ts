import { PhotosAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const photosManifest: AppManifest = {
  id: "photos",
  name: "Photos",
  version: "1.0.0",
  icon: PhotosAppIcon,
  category: "media",
  singleton: true,
  permissions: ["network.fetch"],
  defaultWindow: { width: 960, height: 680, centered: true },
  component: () => import("./App.vue"),
  keywords: ["photos", "images", "gallery", "pictures", "media", "r2"],
};
