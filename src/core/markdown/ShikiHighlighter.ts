import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { PluggableList } from "unified";

import {
  createMarkdownProcessor,
  readFencedCodeLanguages,
  type MarkdownRenderResult,
} from "~/core/markdown/MarkdownPipeline";

const LANGUAGE_LOADERS = {
  bash: () => import("@shikijs/langs/bash"),
  css: () => import("@shikijs/langs/css"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  markdown: () => import("@shikijs/langs/markdown"),
  scss: () => import("@shikijs/langs/scss"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  vue: () => import("@shikijs/langs/vue"),
} as const;

type ShikiHighlighter = Awaited<ReturnType<typeof createHighlighterCore>>;
type CodeLanguage = keyof typeof LANGUAGE_LOADERS;

let highlighterPromise: ReturnType<typeof createHighlighterCore> | undefined;
const languageLoadPromises = new Map<string, Promise<void>>();

export async function renderMarkdownWithShiki(source: string): Promise<MarkdownRenderResult> {
  const highlighter = await getHighlighter();

  await loadLanguagesForSource(highlighter, source);

  const highlightPlugins: PluggableList = [
    [
      rehypeShikiFromHighlighter,
      highlighter,
      {
        defaultLanguage: "text",
        fallbackLanguage: "text",
        themes: {
          light: "vitesse-light",
          dark: "vitesse-dark",
        },
      },
    ],
  ];

  const file = await createMarkdownProcessor({
    afterSanitize: highlightPlugins,
    normalizeCodeLanguage: true,
  }).process(source);

  return { html: String(file) };
}

function getHighlighter(): ReturnType<typeof createHighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [],
    themes: [import("@shikijs/themes/vitesse-dark"), import("@shikijs/themes/vitesse-light")],
  });

  return highlighterPromise;
}

async function loadLanguagesForSource(
  highlighter: ShikiHighlighter,
  source: string,
): Promise<void> {
  await Promise.all(
    readFencedCodeLanguages(source).map((language) => loadLanguage(highlighter, language)),
  );
}

async function loadLanguage(highlighter: ShikiHighlighter, language: string): Promise<void> {
  const loader = LANGUAGE_LOADERS[language as CodeLanguage];

  if (!loader) {
    return;
  }

  let promise = languageLoadPromises.get(language);

  if (!promise) {
    promise = highlighter
      .loadLanguage(loader())
      .then(() => undefined)
      .catch((error: unknown) => {
        languageLoadPromises.delete(language);
        throw error;
      });
    languageLoadPromises.set(language, promise);
  }

  await promise;
}
