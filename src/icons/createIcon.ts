import { Icon, type IconifyIcon } from "@iconify/vue";
import { defineComponent, h, type Component } from "vue";

type IconSize = number | string;

function escapeAttributeValue(value: IconSize): string {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function withStrokeWidth(content: string, strokeWidth: IconSize): string {
  return content.replace(
    /stroke-width="[^"]+"/g,
    `stroke-width="${escapeAttributeValue(strokeWidth)}"`,
  );
}

export function createIcon(icon: IconifyIcon, componentName: string): Component {
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
        const strokeWidth = props.strokeWidth;

        return h(Icon, {
          ...attrs,
          icon,
          mode: "svg",
          width: size,
          height: size,
          customise:
            strokeWidth === undefined
              ? undefined
              : (content: string) => withStrokeWidth(content, strokeWidth),
        });
      };
    },
  });
}

export function createPaletteIcon(icon: IconifyIcon, componentName: string): Component {
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

        return h(Icon, {
          ...attrs,
          icon,
          mode: "svg",
          width: size,
          height: size,
        });
      };
    },
  });
}
