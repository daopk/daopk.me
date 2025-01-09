declare module "vue-axe" {
  import type { App } from "vue";

  interface VueAxeOptions {
    auto?: boolean;
    config?: Record<string, unknown>;
    runOptions?: {
      reporter?: string;
      resultTypes?: Array<"violations" | "incomplete" | "passes" | "inapplicable">;
      [key: string]: unknown;
    };
    plugins?: Array<unknown>;
    [key: string]: unknown;
  }

  interface VueAxePlugin {
    install: (app: App, options?: VueAxeOptions) => void;
  }

  const plugin: VueAxePlugin;
  export default plugin;
}
