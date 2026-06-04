import rehypeSanitize, { type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type PluggableList } from "unified";

export interface MarkdownRenderResult {
  html: string;
}

type MarkdownUrlTarget = "link" | "image";

interface HastNode {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

interface MarkdownProcessorOptions {
  /**
   * Plugins inserted after URL policy + sanitize, before stringify.
   * Syntax highlighting uses this hook so the base parser/sanitizer/url
   * policy stays single-sourced between plain and highlighted renders.
   */
  afterSanitize?: PluggableList;
  normalizeCodeLanguage?: boolean;
}

const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const FENCED_CODE_PATTERN = /^[ \t]{0,3}(```|~~~)/m;
const FENCED_CODE_LANGUAGE_PATTERN = /^[ \t]{0,3}(```+|~~~+)[ \t]*([^\s`~]*)?/gm;
const ALLOWED_LINK_SCHEMES = new Set(["http", "https", "mailto", "youtube-player"]);
const ALLOWED_IMAGE_SCHEMES = new Set(["http", "https"]);
const SUPPORTED_CODE_LANGUAGES = new Set([
  "bash",
  "css",
  "javascript",
  "json",
  "jsonc",
  "markdown",
  "scss",
  "text",
  "tsx",
  "typescript",
  "vue",
]);
const CODE_LANGUAGE_ALIASES = new Map([
  ["cjs", "javascript"],
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["md", "markdown"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["shellscript", "bash"],
  ["ts", "typescript"],
]);

export const markdownSanitizeSchema: SanitizeSchema = {
  allowComments: false,
  allowDoctypes: false,
  ancestors: {
    tbody: ["table"],
    td: ["tr"],
    th: ["tr"],
    thead: ["table"],
    tr: ["table", "thead", "tbody"],
  },
  attributes: {
    "*": [],
    a: ["href", "title"],
    code: [["className", /^language-[A-Za-z0-9_+-]+$/]],
    img: ["src", "alt", "title"],
    input: [
      ["type", "checkbox"],
      ["disabled", true],
      ["checked", true],
    ],
    li: [["className", "task-list-item"]],
    ol: [],
    td: ["align"],
    th: ["align"],
    ul: [["className", "contains-task-list"]],
  },
  clobber: ["ariaDescribedBy", "ariaLabelledBy", "id", "name"],
  clobberPrefix: "user-content-",
  protocols: {
    href: ["http", "https", "mailto", "youtube-player"],
    src: ["http", "https"],
  },
  required: {
    input: {
      disabled: true,
      type: "checkbox",
    },
  },
  strip: ["script", "style"],
  tagNames: [
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "input",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
};

export function sanitizeMarkdownUrl(
  href: string | null | undefined,
  options: { target?: MarkdownUrlTarget } = {},
): string {
  if (!href) {
    return "#";
  }

  const trimmed = href.trim();
  const schemeMatch = SCHEME_PATTERN.exec(trimmed);

  if (!schemeMatch) {
    return trimmed || "#";
  }

  const allowed = options.target === "image" ? ALLOWED_IMAGE_SCHEMES : ALLOWED_LINK_SCHEMES;
  const scheme = schemeMatch[1].toLowerCase();

  return allowed.has(scheme) ? `${scheme}${trimmed.slice(schemeMatch[1].length)}` : "#";
}

export function hasFencedCode(source: string): boolean {
  return FENCED_CODE_PATTERN.test(source);
}

export function readFencedCodeLanguages(source: string): string[] {
  const languages = new Set<string>();

  for (const match of source.matchAll(FENCED_CODE_LANGUAGE_PATTERN)) {
    const rawLanguage = match[2]?.trim();

    if (rawLanguage) {
      languages.add(normalizeCodeLanguage(rawLanguage));
    }
  }

  return [...languages].filter((language) => language !== "text");
}

export function rehypeSafeUrls() {
  return (tree: HastNode): void => {
    visitElements(tree, (node) => {
      if (node.tagName === "a") {
        setSafeUrl(node, "href", "link");
      } else if (node.tagName === "img") {
        setSafeUrl(node, "src", "image");
      }
    });
  };
}

export function rehypeNormalizeCodeLang() {
  return (tree: HastNode): void => {
    visitElements(tree, (node) => {
      if (node.tagName !== "code") {
        return;
      }

      const classList = readClassList(node.properties?.className);
      const languageIndex = classList.findIndex((name) => name.startsWith("language-"));
      const rawLanguage =
        languageIndex >= 0 ? classList[languageIndex]!.slice("language-".length) : "text";
      const normalized = normalizeCodeLanguage(rawLanguage);
      const nextClassList = classList.filter((name) => !name.startsWith("language-"));

      nextClassList.unshift(`language-${normalized}`);

      node.properties ??= {};
      node.properties.className = nextClassList;
    });
  };
}

export async function renderMarkdownToHtml(source: string): Promise<MarkdownRenderResult> {
  if (hasFencedCode(source)) {
    const { renderMarkdownWithShiki } = await import("~/core/markdown/ShikiHighlighter");

    return renderMarkdownWithShiki(source);
  }

  const file = await createMarkdownProcessor().process(source);

  return { html: String(file) };
}

export function createMarkdownProcessor(options: MarkdownProcessorOptions = {}) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSafeUrls)
    .use(rehypeSanitize, markdownSanitizeSchema);

  if (options.normalizeCodeLanguage === true) {
    processor.use(rehypeNormalizeCodeLang);
  }

  if (options.afterSanitize) {
    processor.use(options.afterSanitize);
  }

  return processor.use(rehypeStringify);
}

function setSafeUrl(node: HastNode, property: "href" | "src", target: MarkdownUrlTarget): void {
  node.properties ??= {};
  node.properties[property] = sanitizeMarkdownUrl(toStringProperty(node.properties[property]), {
    target,
  });
}

export function normalizeCodeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  const alias = CODE_LANGUAGE_ALIASES.get(normalized) ?? normalized;

  return SUPPORTED_CODE_LANGUAGES.has(alias) ? alias : "text";
}

function readClassList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(String)
      .flatMap((entry) => entry.split(/\s+/))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(/\s+/).filter(Boolean);
  }

  return [];
}

function toStringProperty(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function visitElements(node: HastNode, visitor: (node: HastNode) => void): void {
  if (node.type === "element") {
    visitor(node);
  }

  for (const child of node.children ?? []) {
    visitElements(child, visitor);
  }
}
