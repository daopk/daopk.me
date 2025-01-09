import { describe, expect, it } from "vitest";

import {
  createMarkdownProcessor,
  readFencedCodeLanguages,
  renderMarkdownToHtml,
  sanitizeMarkdownUrl,
} from "~/core/markdown/MarkdownPipeline";

describe("MarkdownPipeline", () => {
  it("renders basic markdown to HTML", async () => {
    await expect(renderMarkdownToHtml("# About WebOS")).resolves.toEqual({
      html: expect.stringContaining("<h1>About WebOS</h1>"),
    });
  });

  it("renders GFM tables, task lists, and strikethrough", async () => {
    const { html } = await renderMarkdownToHtml(
      [
        "| A | B |",
        "| - | - |",
        "| one | two |",
        "",
        "- [x] shipped",
        "- [ ] pending",
        "",
        "~~old~~",
      ].join("\n"),
    );

    expect(html).toContain("<table>");
    expect(html).toContain("<td>one</td>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("disabled");
    expect(html).toContain("<del>old</del>");
    expect(html).not.toMatch(/\sid=|\sname=/i);
  });

  it("drops raw HTML tokens", async () => {
    const { html } = await renderMarkdownToHtml("Hello\n\n<script>alert(1)</script>");

    expect(html).toContain("Hello");
    expect(html).not.toMatch(/<script/i);
  });

  it("downgrades unsafe link schemes to #", async () => {
    const hostile = [
      "[js](javascript:alert(1))",
      "[data](data:text/html,<script>alert(1)</script>)",
      "[vbs](vbscript:msgbox(1))",
      "[file](file:///etc/passwd)",
    ];

    for (const source of hostile) {
      const { html } = await renderMarkdownToHtml(source);

      expect(html, `failed for ${source}`).toContain('href="#"');
      expect(html, `bad scheme survived in ${source}`).not.toMatch(
        /href="(javascript|data|vbscript|file):/i,
      );
    }
  });

  it("allows http, https, mailto, relative paths, and anchors", async () => {
    expect(sanitizeMarkdownUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeMarkdownUrl("http://example.com")).toBe("http://example.com");
    expect(sanitizeMarkdownUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(sanitizeMarkdownUrl("HTTPS://example.com")).toBe("https://example.com");
    expect(sanitizeMarkdownUrl("MAILTO:a@b.c")).toBe("mailto:a@b.c");
    expect(sanitizeMarkdownUrl("./local")).toBe("./local");
    expect(sanitizeMarkdownUrl("#section")).toBe("#section");
    expect(sanitizeMarkdownUrl("   ")).toBe("#");
  });

  it("preserves allowed uppercase URL schemes after sanitizer runs", async () => {
    const { html } = await renderMarkdownToHtml(
      "[site](HTTPS://example.com)\n\n[email](MAILTO:a@b.c)\n\n![logo](HTTPS://example.com/logo.png)",
    );

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="mailto:a@b.c"');
    expect(html).toContain('src="https://example.com/logo.png"');
  });

  it("applies the same URL allowlist to images", async () => {
    const { html } = await renderMarkdownToHtml("![x](javascript:alert(1))");

    expect(html).toContain('src="#"');
    expect(html).not.toMatch(/src="javascript:/i);
  });

  it("highlights fenced code with Shiki", async () => {
    const { html } = await renderMarkdownToHtml("```ts\nconst answer: number = 42;\n```");

    expect(html).toContain("<pre");
    expect(html).toContain("shiki");
    expect(html).toContain("answer");
    expect(html).toContain("--shiki-dark");
  });

  it("shares sanitize/url policy with processor hooks", async () => {
    const file = await createMarkdownProcessor({ normalizeCodeLanguage: true }).process(
      "[bad](javascript:alert(1))\n\n```ts\nconst answer = 42;\n```",
    );
    const html = String(file);

    expect(html).toContain('href="#"');
    expect(html).toContain("language-typescript");
  });

  it("falls back to text for unknown fenced languages", async () => {
    const { html } = await renderMarkdownToHtml("```mystery\nhello <world>\n```");

    expect(html).toContain("<pre");
    expect(html).toContain("hello");
    expect(html).toContain("&#x3C;world>");
  });

  it("reads normalized fenced code languages for on-demand highlighter loading", () => {
    expect(
      readFencedCodeLanguages(
        [
          "```ts",
          "const answer = 42;",
          "```",
          "",
          "~~~mystery",
          "hello",
          "~~~",
          "",
          "```vue",
          "<template />",
          "```",
        ].join("\n"),
      ),
    ).toEqual(["typescript", "vue"]);
  });

  it("keeps hostile HTML inside fenced code escaped", async () => {
    const { html } = await renderMarkdownToHtml(
      "```html\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n```",
    );

    expect(html).toContain("&#x3C;script");
    expect(html).toContain("&#x3C;img");
    expect(html).not.toMatch(/<script|<img[^>]+onerror=/i);
  });
});
