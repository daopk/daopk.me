import { defineDaopkApp } from "../_shared/viteApp";

// `focus-trap-vue` (+ its `focus-trap` core) is an app-only dependency, so it is
// bundled INTO this app rather than externalized to the host runtime.
export default defineDaopkApp("photos");
