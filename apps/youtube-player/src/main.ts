/**
 * Build entry for the YouTube Player app. Published as a single ES module that
 * `export default`s the root component, loaded by the host at runtime from a
 * versioned URL (see the host's first-party app loader).
 */
export { default } from "./App.vue";
export { default as YouTubeVideoPreview } from "./components/YouTubeVideoPreview.vue";
