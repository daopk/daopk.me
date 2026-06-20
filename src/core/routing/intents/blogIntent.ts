import { blogPostPathFromSlug } from "~/core/routing/blogPaths";

import {
  appIntent,
  decodePathSegment,
  type AppUrlIntent,
  type AppUrlIntentMetadata,
} from "./intentShared";

/** Parses `/blog` and `/blog/<slug>` public paths into a blog launch intent. */
export function parseBlogUrlIntent(
  segments: readonly string[],
  urlIntent?: AppUrlIntentMetadata,
): AppUrlIntent {
  if (segments.length === 1 && segments[0] === "blog") {
    return appIntent("blog", undefined, urlIntent);
  }

  if (segments.length !== 2 || segments[0] !== "blog") {
    return { kind: "none" };
  }

  const slug = decodePathSegment(segments[1]);
  if (slug === null) {
    return { kind: "none" };
  }

  const path = blogPostPathFromSlug(slug);
  return appIntent(
    "blog",
    {
      slug,
      ...(path === null ? {} : { path }),
    },
    urlIntent,
  );
}
