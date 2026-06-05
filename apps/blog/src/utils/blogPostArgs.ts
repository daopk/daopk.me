import { blogPostPathFromSlug } from "@daopk/content";
import { normalizeVfsPath } from "@daopk/sdk";

export interface BlogPostArgs {
  readonly slug?: unknown;
  readonly path?: unknown;
}

export function stringArg(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function documentPathFromPostArgs(args: BlogPostArgs | null | undefined): string | null {
  if (typeof args?.path === "string") {
    try {
      return normalizeVfsPath(args.path);
    } catch {
      // Fall back to slug-derived paths below.
    }
  }

  if (typeof args?.slug !== "string") {
    return null;
  }

  return blogPostPathFromSlug(args.slug);
}
