import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const scssPath = resolve(process.cwd(), "src/assets/scss");
const readScss = (path: string) => readFileSync(resolve(scssPath, path), "utf8");

const foundationEntrypoint = readScss("tokens/_foundation.scss");
const foundationPartials = [
  "tokens/foundation/_color.scss",
  "tokens/foundation/_spacing.scss",
  "tokens/foundation/_radius.scss",
  "tokens/foundation/_typography.scss",
  "tokens/foundation/_motion.scss",
  "tokens/foundation/_control.scss",
]
  .map(readScss)
  .join("\n");

const tokens = [
  "_tokens.scss",
  "tokens/_foundation.scss",
  "tokens/foundation/_color.scss",
  "tokens/foundation/_spacing.scss",
  "tokens/foundation/_radius.scss",
  "tokens/foundation/_typography.scss",
  "tokens/foundation/_motion.scss",
  "tokens/foundation/_control.scss",
  "tokens/_chrome.scss",
  "tokens/_theme.scss",
  "tokens/_density.scss",
]
  .map(readScss)
  .join("\n");

const baseEntrypoint = readScss("base.scss");
const base = [
  "base.scss",
  "base/_document.scss",
  "base/_forms.scss",
  "vendor/_shiki.scss",
  "utilities/_accessibility.scss",
]
  .map(readScss)
  .join("\n");

describe("design tokens", () => {
  it("loads global styles through named cascade layers", () => {
    expect(baseEntrypoint).toContain("@layer reset, tokens, base, vendor, utilities;");
    expect(baseEntrypoint).toContain('@include meta.load-css("tokens");');
    expect(baseEntrypoint).toContain('@include meta.load-css("base/document");');
    expect(baseEntrypoint).toContain('@include meta.load-css("vendor/shiki");');
  });

  it("keeps foundation tokens split behind a stable entrypoint", () => {
    for (const name of ["color", "spacing", "radius", "typography", "motion", "control"]) {
      expect(foundationEntrypoint).toContain(`@forward "foundation/${name}";`);
    }
  });

  it("defines the typography scale anchored on --font-size-base", () => {
    for (const name of [
      "--font-size-xs",
      "--font-size-sm",
      "--font-size-lg",
      "--font-size-xl",
      "--font-size-2xl",
    ]) {
      expect(tokens).toContain(`${name}: calc(var(--font-size-base)`);
    }
  });

  it("defines font-weight and line-height tokens", () => {
    expect(tokens).toContain("--font-weight-medium:");
    expect(tokens).toContain("--font-weight-semibold:");
    expect(tokens).toContain("--font-weight-bold:");
    expect(tokens).toContain("--leading-tight:");
    expect(tokens).toContain("--leading-normal:");
    expect(tokens).toContain("--leading-relaxed:");
  });

  it("defines control-height tokens with touch-density overrides", () => {
    expect(tokens).toContain("--control-height-sm:");
    expect(tokens).toContain("--control-height-md:");
    expect(tokens).toContain("--control-height-lg:");
    expect(tokens).toMatch(/@media \(pointer: coarse\)/);
    expect(tokens).toContain('[data-shell="mobile"]');
    expect(tokens).toContain('[data-pointer="coarse"]');
  });

  it("defines --color-fg-subtle for both themes", () => {
    const matches = tokens.match(/--color-fg-subtle:/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("derives accent hover from the active accent token", () => {
    expect(tokens).toContain("--color-accent-hover: color-mix(in srgb, var(--color-accent)");
    expect(tokens).not.toMatch(/--color-accent-hover:\s*#[0-9a-f]{3,8}\b/i);
  });

  it("defines radius and spacing helpers", () => {
    expect(tokens).toContain("--radius-full:");
    expect(tokens).toContain("--space-2xs:");
    expect(tokens).toContain("--space-2xl:");
    expect(tokens).not.toMatch(/--space-[0-9]+:/);
  });

  it("defines app-facing semantic foundation tokens", () => {
    expect(tokens).toContain("--color-fg-on-accent:");
    expect(tokens).toContain("--spotlight-z:");
    expect(tokens).toContain("--spotlight-scrim:");
  });

  it("defines shared motion tokens in foundation rather than per theme", () => {
    expect(foundationPartials).toContain("--duration-fast: 120ms;");
    expect(foundationPartials).toContain("--duration-base: 380ms;");
    expect(foundationPartials).toContain("--ease:");

    const theme = readScss("tokens/_theme.scss");
    expect(theme).not.toContain("--duration-fast:");
    expect(theme).not.toContain("--duration-base:");
  });

  it("defines lightweight mobile home icon tokens", () => {
    expect(tokens).toContain("--home-screen-icon-size: 56px;");
    expect(tokens).toContain("--home-screen-icon-glyph-size: 44px;");
    expect(tokens).toContain("--home-screen-icon-bg: transparent;");
    expect(tokens).toContain("--home-screen-icon-press-bg:");
    expect(tokens).toContain("--home-screen-icon-shadow: none;");
    expect(tokens).toContain("--home-screen-icon-glyph-shadow:");
  });

  it("applies Shiki dark theme variables from the active theme", () => {
    expect(base).toContain('[data-theme="dark"] .shiki');
    expect(base).toContain("background-color: var(--shiki-dark-bg) !important;");
    expect(base).toContain("color: var(--shiki-dark) !important;");
  });
});
