import { isBlogPostSlug } from "@daopk/content";

export function replaceBrowserPath(pathname: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (
    window.location.pathname === pathname &&
    window.location.search === "" &&
    window.location.hash === ""
  ) {
    return;
  }

  window.history.replaceState(window.history.state, "", pathname);
}

export function replaceBlogIndexPath(): void {
  replaceBrowserPath("/blog");
}

export function replaceBlogPostPath(slug: string): void {
  if (!isBlogPostSlug(slug)) {
    return;
  }

  replaceBrowserPath(`/blog/${slug}`);
}
