import { mergeConfig } from "vite";

import { defineDaopkApp } from "../_shared/viteApp";

export default mergeConfig(defineDaopkApp("baby-touch"), {
  base: "./",
});
