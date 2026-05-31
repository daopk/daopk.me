import { TemplateAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

/**
 * Dev-only catalog of every `components/kit` + `components/ui` primitive. Only
 * registered when `import.meta.env.DEV` (see src/main.ts), so it never ships in
 * production bundles. Open it with `?shell=mobile` to inspect touch density and
 * safe-area behavior, and toggle light/dark from Settings -> Appearance.
 */
export const kitGalleryManifest: AppManifest = {
  id: "_kit-gallery",
  name: "Kit Gallery",
  icon: TemplateAppIcon,
  category: "dev",
  component: async () => import("./App.vue"),
  singleton: true,
  keywords: ["kit", "gallery", "components", "design system", "tokens", "dev"],
};
