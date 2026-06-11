/**
 * Build entry for the Calendar app. `export default`s the root component and
 * exports the `LunarDateWidget` as a NAMED export — the host's first-party
 * widget loaders resolve it by `exportName` for both the mobile-widgets and
 * desktop-wallpaper surfaces using app.manifest.json. Vue and the `@daopk/*`
 * runtime surface are external (vite.config.ts).
 */
export { default } from "./App.vue";
export { default as LunarDateWidget } from "./widgets/LunarDateWidget.vue";
