import {
  createComponent,
  createVaporApp,
  defineVaporComponent,
  nextTick,
  shallowReactive,
  shallowRef,
  unref,
  type AppConfig,
  type Component,
  type InjectionKey,
  type Plugin,
  type ShallowRef,
  type VaporComponent,
  type VaporComponentInstance,
} from "vue";
import { onTestFinished } from "vitest";

import { ToastProvider } from "ropav/toast";

import { assertVaporComponent } from "~/utils/vaporComponent";

export { assertVaporComponent, isVaporComponent } from "~/utils/vaporComponent";

type VaporProvide = readonly [InjectionKey<unknown> | string, unknown];
export type VaporTestComponent = Component | VaporComponent;
type VaporSlot = (...args: unknown[]) => unknown;
type VaporSlotInput = VaporSlot | Node | string | number;
type VaporValueEvent = "change" | "input";
type VaporTestPlugin = Plugin | readonly [Plugin, ...unknown[]];

interface VaporGlobalMountOptions {
  readonly components?: Readonly<Record<string, VaporTestComponent>>;
  readonly config?: Partial<Pick<AppConfig, "errorHandler" | "warnHandler">>;
  readonly mocks?: Readonly<Record<string, unknown>>;
  readonly plugins?: readonly VaporTestPlugin[];
  readonly provide?: Readonly<Record<PropertyKey, unknown>>;
  readonly stubs?: Readonly<Record<string, boolean | VaporTestComponent>>;
}

function normalizeSlotBlock(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSlotBlock);
  if (typeof value === "string") {
    if (value.includes("<")) {
      const template = document.createElement("template");
      template.innerHTML = value;
      return Array.from(template.content.childNodes);
    }
    return document.createTextNode(value);
  }
  if (typeof value === "number") return document.createTextNode(String(value));
  return value;
}

function normalizeSlots(
  slots: Readonly<Record<string, VaporSlotInput>> | undefined,
): Record<string, VaporSlot> | undefined {
  if (slots === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(slots).map(([name, slot]) => [
      name,
      (...args: unknown[]) => {
        const value =
          typeof slot === "function"
            ? slot(...args)
            : slot instanceof Node
              ? slot.cloneNode(true)
              : slot;
        return normalizeSlotBlock(value);
      },
    ]),
  );
}

export interface VaporMountOptions {
  readonly props?: Readonly<Record<string, unknown>>;
  readonly provide?: readonly VaporProvide[];
  readonly slots?: Readonly<Record<string, VaporSlotInput>>;
  readonly global?: VaporGlobalMountOptions;
  readonly toastProvider?: boolean;
}

export interface VaporTestMountOptions extends VaporMountOptions {
  readonly attachTo?: Element | string;
  readonly attrs?: Readonly<Record<string, unknown>>;
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

export function assertVaporComponents(
  components: Readonly<Record<string, VaporTestComponent>>,
): void {
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

interface NativeVaporMount {
  readonly container: HTMLElement;
  readonly emitted: Record<string, unknown[][]>;
  readonly props: Record<string, unknown>;
  readonly rootInstance: () => VaporComponentInstance | undefined;
  readonly unmount: () => void;
}

function handlerKey(event: string): string {
  const camelized = event.replace(/-(\w)/gu, (_, character: string) => character.toUpperCase());
  return `on${camelized.charAt(0).toUpperCase()}${camelized.slice(1)}`;
}

function emittedNames(component: VaporTestComponent): string[] {
  const emits = (
    component as { readonly emits?: readonly string[] | Readonly<Record<string, unknown>> }
  ).emits;
  if (Array.isArray(emits)) return [...emits];
  return emits === undefined ? [] : Object.keys(emits);
}

function installPlugin(app: ReturnType<typeof createVaporApp>, plugin: VaporTestPlugin): void {
  if (Array.isArray(plugin)) {
    app.use(plugin[0], ...(plugin.slice(1) as []));
    return;
  }
  app.use(plugin as Plugin);
}

function configureVaporApp(
  app: ReturnType<typeof createVaporApp>,
  options: VaporTestMountOptions,
): void {
  Object.assign(app.config, options.global?.config);
  for (const plugin of options.global?.plugins ?? []) installPlugin(app, plugin);
  for (const [key, value] of options.provide ?? []) app.provide(key, value);
  for (const key of Reflect.ownKeys(options.global?.provide ?? {})) {
    app.provide(key, options.global?.provide?.[key]);
  }
  for (const [name, registeredComponent] of Object.entries(options.global?.components ?? {})) {
    assertVaporComponent(registeredComponent, name);
    app.component(name, registeredComponent as Component);
  }
  for (const [name, stub] of Object.entries(options.global?.stubs ?? {})) {
    if (stub === false) continue;
    if (stub !== true) assertVaporComponent(stub, name);
    app.component(
      name,
      stub === true
        ? defineVaporComponent(() => document.createElement(`${name.toLowerCase()}-stub`))
        : (stub as Component),
    );
  }
  Object.assign(app.config.globalProperties, options.global?.mocks);
}

function createNativeVaporMount(
  component: VaporTestComponent,
  options: VaporTestMountOptions,
  defaultTarget?: Element,
): NativeVaporMount {
  const container = document.createElement("div");
  const target =
    typeof options.attachTo === "string"
      ? document.querySelector(options.attachTo)
      : (options.attachTo ?? defaultTarget);
  target?.appendChild(container);

  let mounted = true;
  let rootInstance: VaporComponentInstance | undefined;
  const emitted: Record<string, unknown[][]> = {};
  const props = shallowReactive<Record<string, unknown>>({ ...options.props });
  const attrs = options.attrs ?? {};
  const eventKeys = new Set(emittedNames(component).map(handlerKey));
  const captureHandlers = Object.fromEntries(
    emittedNames(component).map((event) => {
      const key = handlerKey(event);
      return [
        key,
        (...args: unknown[]) => {
          (emitted[event] ??= []).push(args);
          const listener = props[key] ?? attrs[key];
          if (typeof listener === "function") listener(...args);
        },
      ];
    }),
  );
  const captureRawProps = Object.fromEntries(
    Object.entries(captureHandlers).map(([key, handler]) => [key, () => handler]),
  );
  const slots = normalizeSlots(options.slots);

  const VaporTestHost = defineVaporComponent(
    () => {
      const createTestComponent = (): VaporComponentInstance => {
        rootInstance = createComponent(
          component as VaporComponent,
          {
            ...captureRawProps,
            $: [
              () =>
                Object.fromEntries(
                  Object.entries({ ...attrs, ...props }).filter(([key]) => !eventKeys.has(key)),
                ),
            ],
          },
          slots as never,
        );
        return rootInstance;
      };

      return options.toastProvider === true
        ? createComponent(ToastProvider, {}, { default: createTestComponent })
        : createTestComponent();
    },
    { name: "VaporTestHost" },
  );

  const app = createVaporApp(VaporTestHost);
  configureVaporApp(app, options);

  try {
    app.mount(container);
  } catch (error) {
    mounted = false;
    container.remove();
    throw error;
  }

  return {
    container,
    emitted,
    props,
    rootInstance: () => rootInstance,
    unmount() {
      if (!mounted) return;
      mounted = false;
      app.unmount();
      container.remove();
    },
  };
}

function createDirectVaporMount(
  component: VaporTestComponent,
  options: VaporTestMountOptions,
  defaultTarget: Element,
): NativeVaporMount {
  const container = document.createElement("div");
  const target =
    typeof options.attachTo === "string"
      ? document.querySelector(options.attachTo)
      : (options.attachTo ?? defaultTarget);
  target?.appendChild(container);

  let mounted = true;
  const props = shallowReactive<Record<string, unknown>>({ ...options.props });
  const app = createVaporApp(component as VaporComponent, props);
  configureVaporApp(app, options);

  try {
    app.mount(container);
  } catch (error) {
    mounted = false;
    container.remove();
    throw error;
  }

  return {
    container,
    emitted: {},
    props,
    rootInstance: () => undefined,
    unmount() {
      if (!mounted) return;
      mounted = false;
      app.unmount();
      container.remove();
    },
  };
}

/**
 * Mount through a native Vapor app without enabling the VDOM interop plugin.
 */
export function mountVapor(
  component: VaporTestComponent,
  options: VaporMountOptions = {},
): VaporMount {
  assertVaporComponent(component);
  const native = createNativeVaporMount(component, options, document.body);
  const element = native.container;

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
      native.unmount();
    },
  };

  // Cleanup still runs when an assertion throws before a test reaches its
  // explicit `unmount()`. The idempotent wrapper keeps existing manual cleanup
  // and suite-level afterEach hooks safe.
  onTestFinished(() => wrapper.unmount());

  return wrapper;
}

type TriggerOptions = Readonly<Record<string, unknown>>;
type ElementSource<T extends Element> = T | null | (() => T | null);

function domEvent(name: string, options: TriggerOptions): Event {
  const init = { bubbles: true, cancelable: true, ...options };
  if (name.startsWith("key")) return new KeyboardEvent(name, init as KeyboardEventInit);
  if (name.startsWith("pointer") && typeof PointerEvent !== "undefined") {
    return new PointerEvent(name, init as PointerEventInit);
  }
  if (
    name.startsWith("mouse") ||
    ["click", "contextmenu", "dblclick", "mouseenter", "mouseleave"].includes(name)
  ) {
    return new MouseEvent(name, init as MouseEventInit);
  }
  if (name.startsWith("focus") || name === "blur") return new FocusEvent(name, init);
  return new Event(name, init);
}

export class VaporDOMWrapper<T extends Element = Element> {
  readonly #source: ElementSource<T>;
  readonly #selector: string;

  constructor(source: ElementSource<T>, selector = "element") {
    this.#source = source;
    this.#selector = selector;
  }

  get element(): T {
    const element = this.resolveElement();
    if (element === null) throw new Error(`Vapor test element not found: ${this.#selector}`);
    return element;
  }

  protected resolveElement(): T | null {
    return typeof this.#source === "function" ? this.#source() : this.#source;
  }

  exists(): boolean {
    return this.resolveElement() !== null;
  }

  find<E extends Element = Element>(selector: string): VaporDOMWrapper<E> {
    return new VaporDOMWrapper<E>(
      () => this.resolveElement()?.querySelector<E>(selector) ?? null,
      selector,
    );
  }

  get<E extends Element = Element>(selector: string): VaporDOMWrapper<E> {
    const wrapper = this.find<E>(selector);
    void wrapper.element;
    return wrapper;
  }

  findAll<E extends Element = Element>(selector: string): VaporDOMWrapper<E>[] {
    const element = this.resolveElement();
    return element === null
      ? []
      : Array.from(
          element.querySelectorAll<E>(selector),
          (match) => new VaporDOMWrapper(match, selector),
        );
  }

  attributes(): Record<string, string>;
  attributes(name: string): string | undefined;
  attributes(name?: string): Record<string, string> | string | undefined {
    const element = this.element;
    if (name !== undefined) return element.getAttribute(name) ?? undefined;
    return Object.fromEntries(Array.from(element.attributes, ({ name, value }) => [name, value]));
  }

  classes(): string[];
  classes(name: string): boolean;
  classes(name?: string): string[] | boolean {
    const classes = Array.from(this.element.classList);
    return name === undefined ? classes : classes.includes(name);
  }

  html(): string {
    return this.element.outerHTML;
  }

  isVisible(): boolean {
    let current: Element | null = this.element;
    while (current !== null) {
      if (
        current.hasAttribute("hidden") ||
        (current instanceof HTMLElement &&
          (current.style.display === "none" || current.style.visibility === "hidden"))
      ) {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  }

  text(): string {
    return (this.element.textContent ?? "").trim();
  }

  async trigger(name: string, options: TriggerOptions = {}): Promise<void> {
    const element = this.element;
    const eventName = name.split(".", 1)[0] ?? name;
    if (
      eventName === "click" &&
      Object.keys(options).length === 0 &&
      element instanceof HTMLElement
    ) {
      element.click();
    } else if (eventName === "focus" && element instanceof HTMLElement) {
      element.focus();
    } else if (eventName === "blur" && element instanceof HTMLElement) {
      element.blur();
    } else {
      element.dispatchEvent(domEvent(eventName, options));
    }
    await nextTick();
  }

  async setValue(value: unknown): Promise<void> {
    const element = this.element;
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      )
    ) {
      throw new TypeError("setValue() requires an input, select, or textarea");
    }
    if (
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio") &&
      typeof value === "boolean"
    ) {
      element.checked = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      await nextTick();
      return;
    }
    element.value = String(value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
    await nextTick();
  }

  async setChecked(checked = true): Promise<void> {
    const element = this.element;
    if (!(element instanceof HTMLInputElement)) {
      throw new TypeError("setChecked() requires an input");
    }
    element.checked = checked;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
  }
}

export interface VaporTestVm {
  readonly $refs: Record<string, unknown>;
  $emit(event: string, ...args: unknown[]): void;
  $nextTick(): Promise<void>;
  readonly [key: string]: unknown;
}

export class VaporTestWrapper<VM extends object = Record<string, unknown>> extends VaporDOMWrapper {
  readonly #native: NativeVaporMount;
  readonly vm: VM & VaporTestVm;

  constructor(native: NativeVaporMount) {
    super(() => native.container.firstElementChild ?? native.container, "component root");
    this.#native = native;
    this.vm = new Proxy({} as VM & VaporTestVm, {
      get: (_target, key) => {
        const instance = native.rootInstance();
        if (key === "$nextTick") return nextTick;
        if (key === "$emit")
          return (event: string, ...args: unknown[]) => instance?.emit(event, ...args);
        if (key === "$refs") return instance?.refs ?? {};
        const state = instance?.exposeProxy ?? instance?.exposed ?? instance?.setupState;
        return state && key in state ? unref(state[key as keyof typeof state]) : undefined;
      },
    });
  }

  override find<E extends Element = Element>(selector: string): VaporDOMWrapper<E> {
    return new VaporDOMWrapper<E>(
      () => this.#native.container.querySelector<E>(selector),
      selector,
    );
  }

  override findAll<E extends Element = Element>(selector: string): VaporDOMWrapper<E>[] {
    return Array.from(
      this.#native.container.querySelectorAll<E>(selector),
      (match) => new VaporDOMWrapper(match, selector),
    );
  }

  emitted(): Record<string, unknown[][]>;
  emitted(event: string): unknown[][] | undefined;
  emitted(event?: string): Record<string, unknown[][]> | unknown[][] | undefined {
    return event === undefined ? this.#native.emitted : this.#native.emitted[event];
  }

  props(): Record<string, unknown>;
  props(name: string): unknown;
  props(name?: string): Record<string, unknown> | unknown {
    return name === undefined ? { ...this.#native.props } : this.#native.props[name];
  }

  async setProps(props: Readonly<Record<string, unknown>>): Promise<void> {
    Object.assign(this.#native.props, props);
    await nextTick();
  }

  unmount(): void {
    this.#native.unmount();
  }
}

/** Mount a real Vapor SFC with a DOM-first wrapper compatible with behavioral tests. */
export function mountVaporTest<VM extends object = Record<string, unknown>>(
  component: VaporTestComponent,
  options: VaporTestMountOptions = {},
): VaporTestWrapper<VM> {
  assertVaporComponent(component);
  // Vapor delegates common DOM events at `document`, so the default test
  // container must be connected for input/click/keyboard behavior to run.
  const wrapper = new VaporTestWrapper<VM>(
    createNativeVaporMount(component, options, document.body),
  );
  onTestFinished(() => wrapper.unmount());
  return wrapper;
}

export interface VaporComposableMount<T> {
  readonly result: T;
  readonly wrapper: VaporTestWrapper;
  unmount(): void;
}

export interface VaporElementComposableMount<
  T,
  E extends HTMLElement,
> extends VaporComposableMount<T> {
  readonly element: E;
}

/** Run a composable inside a real Vapor component lifecycle. */
export function mountVaporComposable<T>(
  setup: () => T,
  options: VaporTestMountOptions = {},
): VaporComposableMount<T> {
  let result!: T;
  const Harness = defineVaporComponent(
    () => {
      result = setup();
      return document.createElement("div");
    },
    { name: "VaporComposableHarness" },
  );
  const wrapper = new VaporTestWrapper(createDirectVaporMount(Harness, options, document.body));
  onTestFinished(() => wrapper.unmount());
  return {
    result,
    wrapper,
    unmount: () => wrapper.unmount(),
  };
}

/** Run a DOM-bound composable against an element owned by a real Vapor root. */
export function mountVaporElementComposable<T, E extends HTMLElement>(
  createElement: () => E,
  setup: (target: ShallowRef<E | null>) => T,
  options: VaporTestMountOptions = {},
): VaporElementComposableMount<T, E> {
  let element!: E;
  let result!: T;
  const Harness = defineVaporComponent(
    () => {
      element = createElement();
      result = setup(shallowRef<E | null>(element));
      return element;
    },
    { name: "VaporElementComposableHarness" },
  );
  const wrapper = new VaporTestWrapper(createDirectVaporMount(Harness, options, document.body));
  onTestFinished(() => wrapper.unmount());

  return {
    element,
    result,
    wrapper,
    unmount: () => wrapper.unmount(),
  };
}

/** Mount a component and fail immediately if it lost its Vapor compilation. */
export function mountVaporRoot(
  component: VaporTestComponent,
  options: VaporMountOptions = {},
  name?: string,
): VaporMount {
  assertVaporComponent(component, name);
  return mountVapor(component, options);
}
