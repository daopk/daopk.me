import { NotesAppIcon } from "~/icons/fluentColor";

import type { FirstPartyAppDescriptor } from "./types";

/**
 * The shell's roster of first-party apps that are built + published
 * independently (out of the shell bundle) and loaded at runtime from the
 * catalog. This is the trusted lane: entries here may use reserved built-in
 * ids, the `system` category, `autorun`, and widgets — none of which untrusted
 * external apps may declare. Adding an app to a wave = add a descriptor here +
 * an `apps/<id>` package + a catalog entry.
 */
export const FIRST_PARTY_APPS: readonly FirstPartyAppDescriptor[] = [
  {
    id: "notes",
    name: "Notes",
    version: "1.0.0",
    icon: NotesAppIcon,
    category: "productivity",
    singleton: true,
    permissions: ["vfs.read", "vfs.write"],
    defaultWindow: { width: 920, height: 620, centered: true },
    keywords: ["notes", "markdown", "writing", "drafts", "journal", "vfs"],
  },
];

/** Reserved ids owned by the first-party roster (kept out of external apps). */
export const FIRST_PARTY_APP_IDS: ReadonlySet<string> = new Set(
  FIRST_PARTY_APPS.map((app) => app.id),
);
