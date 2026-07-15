import { config } from "@vue/test-utils";
import { vi } from "vitest";
import { vaporInteropPlugin, type Component } from "vue";

config.global.plugins.push(vaporInteropPlugin);

// Vue Test Utils 2.4 cannot mount Vapor roots. Keep direct root coverage in the
// Vapor suite while consumer VDOM tests exercise Vapor children through the
// same interop plugin used by production. Icons remain light VDOM stubs here;
// their real Vapor output has dedicated direct-DOM coverage.
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
