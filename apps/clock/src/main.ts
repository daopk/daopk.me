/**
 * Build entry for the Clock app. `export default`s the root component and
 * additionally exports each widget component as a NAMED export. The host's
 * first-party widget loaders resolve these by the `exportName` values in
 * app.manifest.json, so the menubar, wallpaper, and mobile widget surfaces all
 * render from this one published module. Vue and the `@daopk/*` runtime surface
 * are external (vite.config.ts).
 */
export { default } from "./App.vue";
export { default as MenubarClockWidget } from "./widgets/MenubarClockWidget.vue";
export { default as DesktopBigClockWidget } from "./widgets/DesktopBigClockWidget.vue";
export { default as MobileBigClockWidget } from "./widgets/MobileBigClockWidget.vue";
