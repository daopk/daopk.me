import { EditorAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const editorManifest: AppManifest = {
  id: "editor",
  name: "Editor",
  icon: EditorAppIcon,
  category: "productivity",
  singleton: false,
  permissions: ["vfs.read", "vfs.write"],
  defaultWindow: { width: 900, height: 620, centered: true },
  component: () => import("./App.vue"),
  keywords: ["editor", "text", "markdown", "write", "notes", "vfs"],
};
