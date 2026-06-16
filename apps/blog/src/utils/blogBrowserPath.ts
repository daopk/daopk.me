import { isBlogPostSlug } from "@daopk/content";

function replaceBrowserPath(pathname: string): void {
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

export function blogPostBrowserPath(slug: string): string | null {
  return isBlogPostSlug(slug) ? `/blog/${slug}` : null;
}

export function replaceBlogPostPath(slug: string): void {
  const path = blogPostBrowserPath(slug);
  if (path === null) {
    return;
  }

  replaceBrowserPath(path);
}
