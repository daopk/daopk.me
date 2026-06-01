import { defineDaopkApp } from "../_shared/viteApp";

// pdfjs-dist + its worker are bundled INTO this app (not externalized): they are
// app-only and heavy, so they ship in the app's own version-pinned chunks
// (uploaded to R2 alongside the entry) rather than the host runtime. The worker
// is referenced via `pdfjs-dist/build/pdf.worker.mjs?url` and dynamically
// imported in `usePdfViewer.ts`, so Vite emits it as its own lazy chunk
// (loaded only when a PDF opens) with the worker source as a self-contained
// `data:` URL — no path resolution needed regardless of the app's R2 base.
export default defineDaopkApp("pdf-viewer");
