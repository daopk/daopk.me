import { TerminalAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const terminalManifest: AppManifest = {
  id: "terminal",
  name: "Terminal",
  version: "1.0.0",
  icon: TerminalAppIcon,
  category: "dev",
  permissions: ["vfs.read"],
  defaultWindow: { width: 720, height: 420 },
  component: () => import("./App.vue"),
  keywords: ["console", "shell", "command", "tty"],
};
