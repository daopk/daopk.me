import {
  createApp,
  defineComponent,
  h,
  nextTick,
  vaporInteropPlugin,
  type Component,
  type InjectionKey,
} from "vue";

type VaporProvide = readonly [InjectionKey<unknown> | string, unknown];
type VaporSlot = (...args: never[]) => unknown;

export interface VaporMountOptions {
  readonly props?: Readonly<Record<string, unknown>>;
  readonly provide?: readonly VaporProvide[];
  readonly slots?: Readonly<Record<string, VaporSlot>>;
}

export interface VaporMount {
  readonly element: HTMLElement;
  click(selector: string): Promise<void>;
  exists(selector: string): boolean;
  find<T extends Element = Element>(selector: string): T;
  findAll<T extends Element = Element>(selector: string): T[];
  html(): string;
  setValue(selector: string, value: string): Promise<void>;
  text(): string;
  unmount(): void;
}

/**
 * Mount a Vapor component through the same VDOM-to-Vapor boundary used by the
 * production shell. Vue Test Utils 2.4 does not understand Vapor blocks yet,
 * so the dedicated Vapor suite asserts against the real DOM directly.
 */
export function mountVapor(component: Component, options: VaporMountOptions = {}): VaporMount {
  const element = document.createElement("div");
  document.body.appendChild(element);

  const VaporTestHost = defineComponent({
    name: "VaporTestHost",
    render: () =>
      h("div", { "data-vapor-test-host": "" }, [
        h(component, options.props ?? null, options.slots),
      ]),
  });

  const app = createApp(VaporTestHost);
  app.use(vaporInteropPlugin);
  for (const [key, value] of options.provide ?? []) {
    app.provide(key, value);
  }
  app.mount(element);

  return {
    element,
    async click(selector: string): Promise<void> {
      const target = element.querySelector<HTMLElement>(selector);
      if (!target) {
        throw new Error(`Vapor test element not found: ${selector}`);
      }
      target.click();
      await nextTick();
    },
    exists(selector: string): boolean {
      return element.querySelector(selector) !== null;
    },
    find<T extends Element = Element>(selector: string): T {
      const match = element.querySelector<T>(selector);
      if (!match) {
        throw new Error(`Vapor test element not found: ${selector}`);
      }
      return match;
    },
    findAll<T extends Element = Element>(selector: string): T[] {
      return Array.from(element.querySelectorAll<T>(selector));
    },
    html(): string {
      return element.innerHTML;
    },
    async setValue(selector: string, value: string): Promise<void> {
      const target = element.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(selector);
      if (!target) {
        throw new Error(`Vapor test form control not found: ${selector}`);
      }
      target.value = value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      await nextTick();
    },
    text(): string {
      return element.textContent ?? "";
    },
    unmount(): void {
      app.unmount();
      element.remove();
    },
  };
}
