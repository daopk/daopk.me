/**
 * Build entry for the PDF Viewer app. Published as a single ES module that
 * `export default`s the root component, loaded by the host at runtime from a
 * versioned URL. Vue and the `@daopk/*` runtime surface are external
 * (apps/_shared/viteApp.ts) and resolve to the host via the import map;
 * pdfjs-dist + its worker are bundled into this app's own chunks.
 */
export { default } from "./App.vue";
