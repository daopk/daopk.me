import { defineDaopkApp } from "../_shared/viteApp";

// Clock ships its menubar/wallpaper/mobile widget components as named exports
// from `src/main.ts` (resolved by the host's first-party widget loaders); they
// bundle into the single app module alongside the default root component.
export default defineDaopkApp("clock");
