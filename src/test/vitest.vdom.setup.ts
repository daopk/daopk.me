import { vi } from "vitest";
import type { Component } from "vue";

// Vue Test Utils 2.4 cannot mount Vapor roots and Node's Vue condition does not
// expose the Vapor runtime. Keep the legacy VDOM suite isolated by replacing
// only the shared icon factory; real Vapor icons and VDOM interop are covered by
// `vitest.vapor.config.ts` against the browser ESM runtime.
vi.mock("~/icons/createIcon", async () => {
  const { defineComponent, h } = await import("vue");

  function createSvgIcon(_icon: unknown, componentName: string): Component {
    return defineComponent({
      name: componentName,
      inheritAttrs: false,
      props: {
        size: {
          type: [Number, String],
          default: undefined,
        },
        strokeWidth: {
          type: [Number, String],
          default: undefined,
        },
      },
      setup(props, { attrs }) {
        return () => {
          const size = props.size ?? 24;
          return h("svg", {
            ...attrs,
            "data-icon-stub": componentName,
            width: size,
            height: size,
          });
        };
      },
    });
  }

  function createImageIcon(src: string, componentName: string): Component {
    return defineComponent({
      name: componentName,
      inheritAttrs: false,
      props: {
        size: {
          type: [Number, String],
          default: undefined,
        },
        strokeWidth: {
          type: [Number, String],
          default: undefined,
        },
      },
      setup(props, { attrs }) {
        return () => {
          const size = props.size ?? 24;
          return h("img", {
            ...attrs,
            src,
            width: size,
            height: size,
            alt: "",
            draggable: false,
            decoding: "async",
          });
        };
      },
    });
  }

  return {
    createIcon: createSvgIcon,
    createPaletteIcon: createSvgIcon,
    createImageIcon,
  };
});
