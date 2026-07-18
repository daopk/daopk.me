import { createPinia } from "pinia";
import { createVaporApp } from "vue";

import "~/core/boot/syncPreflightTheme";
import "~/assets/scss/base.scss";
import "ropav/base.css";
import "~/components/ui/ropavBridge.scss";
// Standalone first-party apps import @daopk/ui through the import map; preload
// the UI runtime once so Vite links every Ropav component stylesheet with the shell HTML.
import "~/runtime/ui";
// Standalone first-party apps import @daopk/kit through the import map; preload
// the kit once so Vite links its scoped component CSS with the shell HTML.
import "~/runtime/kit";
// Same CSS-loading contract for shared file UI consumed by external apps.
import "~/runtime/files";

import App from "~/App.vue";
import { appStoreManifest } from "~/apps/app-store";
import { finderManifest } from "~/apps/finder";
import { settingsManifest } from "~/apps/settings";
import { terminalManifest } from "~/apps/terminal";
import { trashManifest } from "~/apps/trash";
import { BootManager, BootManagerInjectionKey, bootstrapKernel, defaultBootPhases } from "~/core";
import { registerPwaInstallPrompt } from "~/service-worker/installController";

import { referralCode } from "~/utils/console";

import { KernelInjectionKey } from "~/types/kernel";

const app = createVaporApp(App);
const disposePwaInstallPrompt = registerPwaInstallPrompt();

app.use(createPinia());

const kernel = bootstrapKernel();

kernel.apps.register(finderManifest, { source: "system" });

// External first-party apps are registered by `firstPartyAppsPhase` (from the
// catalog in prod, from app-owned manifests + workspace packages in dev) rather
// than bundled here.

kernel.apps.register(terminalManifest);

kernel.apps.register(settingsManifest, { source: "system" });

kernel.apps.register(appStoreManifest);

kernel.apps.register(trashManifest, { source: "system" });

// Dev-only component gallery. The DEV gate + dynamic import keep it out of
// production bundles; the launcher reacts to `app.registered`, so registering
// after the synchronous boot is fine.
if (import.meta.env.DEV) {
  void import("~/apps/_kit-gallery").then(({ kitGalleryManifest }) => {
    kernel.apps.register(kitGalleryManifest);
  });
}

app.provide(KernelInjectionKey, kernel);

const bootManager = new BootManager(kernel, kernel.boot, [...defaultBootPhases]);

app.provide(BootManagerInjectionKey, bootManager);

// Dev-only a11y runtime. The dynamic import + DEV gate means direct axe-core
// audits stay best-effort and never enter the production module graph.
let disposeAxeRuntime = (): void => {};
let mainDisposed = false;
if (import.meta.env.DEV) {
  void import("~/devtools/axe-bootstrap")
    .then(async ({ installAxeIfDev }) => {
      const dispose = await installAxeIfDev();
      if (mainDisposed) {
        dispose();
        return;
      }
      disposeAxeRuntime = dispose;
    })
    .catch(() => {
      // Intentional dev-only swallow — `installAxeIfDev` already logs
    });
}

app.mount("#app");

referralCode();

import.meta.hot?.dispose(() => {
  mainDisposed = true;
  disposeAxeRuntime();
  disposePwaInstallPrompt();
  bootManager.dispose();
  kernel.dispose();
});
