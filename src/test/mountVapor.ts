import { createApp, defineComponent, h, vaporInteropPlugin, type Component } from "vue";

export interface VaporMount {
  readonly element: HTMLElement;
  find<T extends Element = Element>(selector: string): T;
  unmount(): void;
}

/**
 * Mount a Vapor component through the same VDOM-to-Vapor boundary used by the
 * production shell. Vue Test Utils 2.4 does not understand Vapor blocks yet,
 * so the dedicated Vapor suite asserts against the real DOM directly.
 */
export function mountVapor(component: Component): VaporMount {
  const element = document.createElement("div");
  document.body.appendChild(element);

  const VaporTestHost = defineComponent({
    name: "VaporTestHost",
    render: () => h("div", { "data-vapor-test-host": "" }, [h(component)]),
  });

  const app = createApp(VaporTestHost);
  app.use(vaporInteropPlugin);
  app.mount(element);

  return {
    element,
    find<T extends Element = Element>(selector: string): T {
      const match = element.querySelector<T>(selector);
      if (!match) {
        throw new Error(`Vapor test element not found: ${selector}`);
      }
      return match;
    },
    unmount(): void {
      app.unmount();
      element.remove();
    },
  };
}
