import { defineDaopkApp } from "../_shared/viteApp";

// Clock ships its menubar/wallpaper/mobile widget components as named exports
// from `src/main.ts`; app.manifest.json names those exports so the host can
// resolve them from the single app module alongside the default root component.
export default defineDaopkApp("clock");
