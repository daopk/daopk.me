import { ClockAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const clockManifest: AppManifest = {
  id: "clock",
  name: "Clock",
  version: "1.0.0",
  icon: ClockAppIcon,
  category: "productivity",
  singleton: true,
  permissions: ["storage.write"],
  defaultWindow: { width: 760, height: 560, centered: true },
  widgets: [
    {
      id: "clock:menubar",
      title: "Clock",
      description: "Compact time in the desktop menubar.",
      surface: "desktop:menubar",
      size: "sm",
      defaultVisible: true,
      component: () => import("./widgets/MenubarClockWidget.vue"),
    },
    {
      id: "clock:desktop-big",
      title: "Clock",
      description: "Large desktop clock with the current date.",
      surface: "desktop:wallpaper",
      size: "md",
      defaultVisible: true,
      defaultPlacement: { anchor: "top-right", insetX: 1, insetY: 1 },
      component: () => import("./widgets/DesktopBigClockWidget.vue"),
    },
    {
      id: "clock:mobile-big",
      title: "Clock",
      description: "Large clock card for the mobile widgets page.",
      surface: "mobile:widgets",
      size: "lg",
      defaultVisible: true,
      component: () => import("./widgets/MobileBigClockWidget.vue"),
    },
  ],
  component: () => import("./App.vue"),
  keywords: ["clock", "time", "timer", "stopwatch"],
};
