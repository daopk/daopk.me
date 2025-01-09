import type { AppPermission } from "~/types/app";

export function permissionLabel(permission: AppPermission): string {
  switch (permission) {
    case "notifications.post":
      return "send you notifications";
    case "network.fetch":
      return "access the network";
    case "vfs.read":
      return "read files in your workspace";
    case "vfs.write":
      return "write files to your workspace";
    case "storage.write":
      return "store data on this device";
    case "shortcut.global":
      return "register a global keyboard shortcut";
    default: {
      const _exhaustive: never = permission;
      return _exhaustive;
    }
  }
}
