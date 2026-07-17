import { THEMES, type ThemeName } from "~/core/theme/tokens";
import type { ResolvedTheme, ThemePreference } from "~/types/theme";

export type { ThemePreference } from "~/types/theme";

export interface ThemeManagerDeps {
  getPreference: () => ThemePreference;
  persist: (preference: ThemePreference) => void;
  getSystemPreference: () => ResolvedTheme;
  subscribeSystemPreference: (cb: (resolved: ResolvedTheme) => void) => () => void;
}

export class ThemeManager {
  private readonly deps: ThemeManagerDeps;

  private readonly listeners = new Set<(theme: ResolvedTheme) => void>();

  private readonly lastAppliedOverrides = new Map<string, string>();

  private disposeSystemPref?: () => void;

  constructor(deps: ThemeManagerDeps) {
    this.deps = deps;
  }

  current(): ResolvedTheme {
    return this.resolve();
  }

  setTheme(name: ThemePreference): void {
    this.deps.persist(name);
  }

  subscribe(listener: (theme: ResolvedTheme) => void): () => void {
    this.listeners.add(listener);
    listener(this.resolve());

    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyResolved(theme: ResolvedTheme): void {
    for (const cb of Array.from(this.listeners)) {
      cb(theme);
    }
  }

  applyToDocument(theme: ResolvedTheme): void {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.rpColorScheme = theme;
  }

  applyOverrides(next: Readonly<Record<string, string>>): boolean {
    let mutated = false;

    const root = typeof document === "undefined" ? null : document.documentElement;

    for (const [key, value] of Object.entries(next)) {
      if (this.lastAppliedOverrides.get(key) === value) {
        continue;
      }

      root?.style.setProperty(key, value);
      this.lastAppliedOverrides.set(key, value);
      mutated = true;
    }

    for (const key of Array.from(this.lastAppliedOverrides.keys())) {
      if (key in next) {
        continue;
      }

      root?.style.removeProperty(key);
      this.lastAppliedOverrides.delete(key);
      mutated = true;
    }

    return mutated;
  }

  currentOverrides(): Readonly<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.lastAppliedOverrides) {
      out[k] = v;
    }
    return Object.freeze(out);
  }

  subscribeSystemPreference(): void {
    this.disposeSystemPref?.();
    this.disposeSystemPref = this.deps.subscribeSystemPreference((resolved) => {
      if (this.deps.getPreference() !== "system") {
        return;
      }

      this.applyToDocument(resolved);
      this.notifyResolved(resolved);
    });
  }

  list(): readonly ThemeName[] {
    return Object.freeze(Object.keys(THEMES)) as ThemeName[];
  }

  dispose(): void {
    this.disposeSystemPref?.();
    this.disposeSystemPref = undefined;
    this.listeners.clear();

    // Strip applied overrides from the document on dispose so HMR / kernel
    // teardown doesn't leave the previous instance's variables painted on
    const root = typeof document === "undefined" ? null : document.documentElement;
    for (const key of this.lastAppliedOverrides.keys()) {
      root?.style.removeProperty(key);
    }
    this.lastAppliedOverrides.clear();
  }

  private resolve(): ResolvedTheme {
    const pref = this.deps.getPreference();

    return pref === "system" ? this.deps.getSystemPreference() : pref;
  }
}
