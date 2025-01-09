import type { App } from "vue";

import { debugLog } from "~/core/debug";

interface VueAxePlugin {
  default: { install: (app: App, options?: Record<string, unknown>) => void };
}

export async function installAxeIfDev(app: App): Promise<void> {
  if (!import.meta.env.DEV) {
    return;
  }

  try {
    const mod = (await import("vue-axe")) as VueAxePlugin;
    app.use(mod.default, {
      auto: true,
      runOptions: {
        resultTypes: ["violations"],
      },
    });
    debugLog("[axe] vue-axe installed in dev mode");
  } catch (error) {
    debugLog("[axe] vue-axe failed to install — continuing without a11y dev runtime", error);
  }
}
