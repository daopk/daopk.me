import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const tokensPath = resolve(process.cwd(), "src/assets/scss/_tokens.scss");
const basePath = resolve(process.cwd(), "src/assets/scss/base.scss");
const tokens = readFileSync(tokensPath, "utf8");
const base = readFileSync(basePath, "utf8");

describe("design tokens", () => {
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

  it("defines radius-full and space-2xs helpers", () => {
    expect(tokens).toContain("--radius-full:");
    expect(tokens).toContain("--space-2xs:");
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
