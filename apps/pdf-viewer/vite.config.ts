import { defineDaopkApp } from "../_shared/viteApp";

// pdfjs-dist + its worker are bundled INTO this app (not externalized): they are
// app-only and heavy, so they ship in the app's own version-pinned chunks
// (uploaded to R2 alongside the entry) rather than the host runtime.
export default defineDaopkApp("pdf-viewer");
