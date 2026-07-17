import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";
import type { Component } from "vue";

import { assertVaporComponents } from "./mountVapor";

const REPOSITORY_ROOT = process.cwd();
const VAPOR_SCRIPT_RE = /<script\b[^>]*\bvapor\b[^>]*>/u;
const SKIPPED_DIRECTORIES = new Set(["dist", "node_modules"]);

const SOURCE_COMPONENTS = import.meta.glob<Component>("../**/*.vue", {
  eager: true,
  import: "default",
});
const APP_COMPONENTS = import.meta.glob<Component>("../../apps/*/src/**/*.vue", {
  eager: true,
  import: "default",
});

const VAPOR_COMPONENTS = Object.fromEntries([
  ...Object.entries(SOURCE_COMPONENTS).map(([path, component]) => [
    path.replace(/^\.\.\//u, "src/"),
    component,
  ]),
  ...Object.entries(APP_COMPONENTS).map(([path, component]) => [
    path.replace(/^\.\.\/\.\.\//u, ""),
    component,
  ]),
]) satisfies Readonly<Record<string, Component>>;

function collectVueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
      return collectVueFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".vue") ? [path] : [];
  });
}

function authoredVaporComponents(): string[] {
  return [resolve(REPOSITORY_ROOT, "src"), resolve(REPOSITORY_ROOT, "apps")]
    .flatMap(collectVueFiles)
    .filter((path) => VAPOR_SCRIPT_RE.test(readFileSync(path, "utf8")))
    .map((path) => relative(REPOSITORY_ROOT, path).split(sep).join("/"))
    .sort();
}

describe("Vapor component registry", () => {
  it("tracks every SFC authored in Vapor mode", () => {
    expect(Object.keys(VAPOR_COMPONENTS).sort()).toEqual(authoredVaporComponents());
  });

  it("compiles every registered SFC into a Vapor component", () => {
    assertVaporComponents(VAPOR_COMPONENTS);
  });
});
