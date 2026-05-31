import { NotesAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const notesManifest: AppManifest = {
  id: "notes",
  name: "Notes",
  version: "1.0.0",
  icon: NotesAppIcon,
  category: "productivity",
  singleton: true,
  permissions: ["vfs.read", "vfs.write"],
  defaultWindow: { width: 920, height: 620, centered: true },
  component: () => import("./App.vue"),
  keywords: ["notes", "markdown", "writing", "drafts", "journal", "vfs"],
};
