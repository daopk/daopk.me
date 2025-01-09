import { TrashAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const trashManifest: AppManifest = {
  id: "trash",
  name: "Trash",
  icon: TrashAppIcon,
  category: "system",
  hidden: true,
  singleton: true,
  permissions: ["vfs.read", "vfs.write"],
  defaultWindow: { width: 760, height: 500, centered: true },
  component: () => import("./App.vue"),
  keywords: ["trash", "deleted", "restore", "bin"],
};
