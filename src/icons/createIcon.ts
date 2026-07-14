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

/**
 * Build an icon component that renders an app-owned image (e.g. a release-pinned
 * `icon.png` served from the app's catalog directory). Accepts the same
 * `size`/`strokeWidth` props as the iconify-backed factories so it is a drop-in
 * for `<component :is>` icon slots; `strokeWidth` is ignored for raster/SVG
 * images. Rendering as `<img>` means the SVG cannot execute script or reach the
 * host DOM, which keeps app-supplied art inside the trusted-identity boundary.
 */
export function createImageIcon(src: string, componentName: string): Component {
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
