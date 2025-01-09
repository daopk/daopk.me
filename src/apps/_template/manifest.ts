import { TemplateAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const templateManifest: AppManifest = {
  id: "_template",
  name: "Starter App",
  icon: TemplateAppIcon,
  category: "dev",
  component: async () => import("./App.vue"),
  singleton: false,
};
