import { createPinia } from "pinia";
import { createApp } from "vue";

import "~/core/boot/syncPreflightTheme";
import "~/assets/scss/base.scss";
// Standalone first-party apps import @daopk/kit through the import map; preload
// the kit once so Vite links its scoped component CSS with the shell HTML.
import "~/runtime/kit";

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
import { disposeBuiltinWidgets, registerBuiltinWidgets } from "~/widgets/builtin";

const app = createApp(App);
const disposePwaInstallPrompt = registerPwaInstallPrompt();

app.use(createPinia());

const kernel = bootstrapKernel();

kernel.apps.register(finderManifest);

// `notes`, `browser`, `editor`, `pdf-viewer`, `photos`, `blog`, `clock`, and
// `calendar` are first-party apps published independently of the
// shell; they are registered by `firstPartyAppsPhase` (from the catalog in
// prod, from their workspace packages in dev) rather than bundled here.

kernel.apps.register(terminalManifest);

kernel.apps.register(settingsManifest);

kernel.apps.register(appStoreManifest);

kernel.apps.register(trashManifest);

// Dev-only component gallery. The DEV gate + dynamic import keep it out of
// production bundles; the launcher reacts to `app.registered`, so registering
// after the synchronous boot is fine.
if (import.meta.env.DEV) {
  void import("~/apps/_kit-gallery").then(({ kitGalleryManifest }) => {
    kernel.apps.register(kitGalleryManifest);
  });
}

registerBuiltinWidgets(kernel);

app.provide(KernelInjectionKey, kernel);

const bootManager = new BootManager(kernel, kernel.boot, [...defaultBootPhases]);

app.provide(BootManagerInjectionKey, bootManager);

// Dev-only a11y runtime (vue-axe). The dynamic import + DEV gate means
// dev a11y is best-effort — never crash the app for it.
if (import.meta.env.DEV) {
  void import("~/devtools/axe-bootstrap")
    .then(({ installAxeIfDev }) => installAxeIfDev(app))
    .catch(() => {
      // Intentional dev-only swallow — `installAxeIfDev` already logs
    });
}

app.mount("#app");

referralCode();

import.meta.hot?.dispose(() => {
  disposePwaInstallPrompt();
  bootManager.dispose();
  disposeBuiltinWidgets();
  kernel.dispose();
});
