import {
  createApp,
  defineComponent,
  h,
  nextTick,
  vaporInteropPlugin,
  type Component,
  type InjectionKey,
} from "vue";
import { onTestFinished } from "vitest";

type VaporProvide = readonly [InjectionKey<unknown> | string, unknown];
type VaporSlot = (...args: never[]) => unknown;
type VaporValueEvent = "change" | "input";

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
  setValue(selector: string, value: string, eventType?: VaporValueEvent): Promise<void>;
  text(): string;
  trigger(selector: string, event: Event): Promise<void>;
  unmount(): void;
}

export function isVaporComponent(component: Component): boolean {
  return (
    typeof component === "object" &&
    component !== null &&
    "__vapor" in component &&
    component.__vapor === true
  );
}

export function assertVaporComponent(
  component: Component,
  name = "Component",
): asserts component is Component & { readonly __vapor: true } {
  if (!isVaporComponent(component)) {
    throw new TypeError(`${name} was not compiled in Vapor mode`);
  }
}

export function assertVaporComponents(components: Readonly<Record<string, Component>>): void {
  for (const [name, component] of Object.entries(components)) {
    assertVaporComponent(component, name);
  }
}

export async function flushPromises(): Promise<void> {
  // Drain chained async setup work without relying on timers, which may be
  // paused by tests using fake clocks in Vitest's Vapor VM pool.
  for (let index = 0; index < 16; index += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

/**
 * Mount a Vapor component through the same VDOM-to-Vapor boundary used by the
 * production shell. Vue Test Utils 2.4 does not understand Vapor blocks yet,
 * so the dedicated Vapor suite asserts against the real DOM directly.
 */
export function mountVapor(component: Component, options: VaporMountOptions = {}): VaporMount {
  const element = document.createElement("div");
  document.body.appendChild(element);
  let mounted = true;

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
  try {
    app.mount(element);
  } catch (error) {
    mounted = false;
    element.remove();
    throw error;
  }

  const wrapper: VaporMount = {
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
    async setValue(selector: string, value: string, eventType?: VaporValueEvent): Promise<void> {
      const target = element.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(selector);
      if (!target) {
        throw new Error(`Vapor test form control not found: ${selector}`);
      }
      target.value = value;
      target.dispatchEvent(
        new Event(eventType ?? (target instanceof HTMLSelectElement ? "change" : "input"), {
          bubbles: true,
        }),
      );
      await nextTick();
    },
    text(): string {
      return element.textContent ?? "";
    },
    async trigger(selector: string, event: Event): Promise<void> {
      const target = element.querySelector<HTMLElement>(selector);
      if (!target) {
        throw new Error(`Vapor test element not found: ${selector}`);
      }
      target.dispatchEvent(event);
      await nextTick();
    },
    unmount(): void {
      if (!mounted) return;
      mounted = false;
      app.unmount();
      element.remove();
    },
  };

  // Cleanup still runs when an assertion throws before a test reaches its
  // explicit `unmount()`. The idempotent wrapper keeps existing manual cleanup
  // and suite-level afterEach hooks safe.
  onTestFinished(() => wrapper.unmount());

  return wrapper;
}

/** Mount a component and fail immediately if it lost its Vapor compilation. */
export function mountVaporRoot(
  component: Component,
  options: VaporMountOptions = {},
  name?: string,
): VaporMount {
  assertVaporComponent(component, name);
  return mountVapor(component, options);
}
