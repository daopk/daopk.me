import { defineDaopkApp } from "../_shared/viteApp";

// Calendar ships its `LunarDateWidget` (used by both the mobile and wallpaper
// widget surfaces) as a named export from `src/main.ts`; its settings panel and
// event dialog are internal components bundled into the single app module. No
// app-only heavy deps — the Vietnamese-lunar logic is local source.
export default defineDaopkApp("calendar");
