/**
 * Build entry for the hidden canvas demo app. The default export is only used
 * for the unsupported-browser fallback window; desktop demos are named widget
 * exports.
 */
export { default } from "./components/App.vue";
export { default as BreakingGlassDesktopWidget } from "./widgets/BreakingGlassDesktopWidget.vue";
