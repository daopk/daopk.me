import type { InjectionKey } from "vue";

export const KernelInjectionKey = Symbol("daopk.kernel") as InjectionKey<unknown>;
export const AppContextInjectionKey = Symbol("AppContext") as InjectionKey<unknown>;
export const AppChromeInjectionKey = Symbol("AppChrome") as InjectionKey<unknown>;
