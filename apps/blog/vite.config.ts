import { defineDaopkApp } from "../_shared/viteApp";

// Blog has no app-only heavy deps: markdown rendering resolves to the host's
// shared `@daopk/markdown` chunk and the blog content/date/path helpers to
// `@daopk/content`, so nothing extra is bundled here.
export default defineDaopkApp("blog");
