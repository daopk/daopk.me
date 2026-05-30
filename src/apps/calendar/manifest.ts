import { CalendarAppIcon } from "~/icons/fluentColor";

import type { AppManifest } from "~/types/app";

export const calendarManifest: AppManifest = {
  id: "calendar",
  name: "Calendar",
  icon: CalendarAppIcon,
  category: "productivity",
  singleton: true,
  permissions: ["vfs.read", "vfs.write", "storage.write"],
  defaultWindow: { width: 980, height: 680, centered: true },
  widgets: [
    {
      id: "calendar:lunar-date-mobile",
      title: "Lunar Date",
      description: "Vietnamese lunar date on the mobile widgets page.",
      surface: "mobile:widgets",
      size: "md",
      component: () => import("./widgets/LunarDateWidget.vue"),
    },
    {
      id: "calendar:lunar-date-desktop",
      title: "Lunar Date",
      description: "Vietnamese lunar date on the desktop.",
      surface: "desktop:wallpaper",
      size: "md",
      priority: 80,
      component: () => import("./widgets/LunarDateWidget.vue"),
    },
  ],
  component: () => import("./App.vue"),
  keywords: ["calendar", "events", "schedule", "agenda", "planner", "settings", "preferences"],
  settings: {
    keywords: ["calendar settings", "week start", "lunar calendar", "event defaults"],
  },
};
