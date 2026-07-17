import type { IconifyIcon } from "@iconify/utils";
import { markRaw, type VaporComponent } from "vue";

import ImageIcon from "./ImageIcon.vue";
import SvgIcon from "./SvgIcon.vue";

type ComponentOptions = Record<string, unknown> & {
  props?: Record<string, unknown>;
};

function getComponentOptions(component: VaporComponent): ComponentOptions {
  if (typeof component !== "object" || component === null) {
    throw new TypeError("Vapor icon base must compile to a component options object");
  }

  return component as ComponentOptions;
}

function cloneWithDefaultProp(
  base: VaporComponent,
  componentName: string,
  propName: "icon" | "src",
  defaultValue: IconifyIcon | string,
): VaporComponent {
  const options = getComponentOptions(base);
  const propOptions = options.props ?? {};
  const existingProp = propOptions[propName];

  if (typeof existingProp !== "object" || existingProp === null) {
    throw new TypeError(`Vapor icon base is missing the ${propName} prop`);
  }

  return markRaw({
    ...options,
    name: componentName,
    __name: componentName,
    props: {
      ...propOptions,
      [propName]: {
        ...existingProp,
        required: false,
        default: typeof defaultValue === "string" ? defaultValue : () => defaultValue,
      },
    },
  }) as VaporComponent;
}

export function createIcon(icon: IconifyIcon, componentName: string): VaporComponent {
  return cloneWithDefaultProp(SvgIcon, componentName, "icon", icon);
}

/**
 * Build a Vapor icon component that renders app-owned image artwork through an
 * `<img>` element. It deliberately accepts the same `size`/`strokeWidth` props
 * as SVG icons so all icon components remain interchangeable; `strokeWidth` is
 * ignored for image sources.
 */
export function createImageIcon(src: string, componentName: string): VaporComponent {
  return cloneWithDefaultProp(ImageIcon, componentName, "src", src);
}

export function createPaletteIcon(icon: IconifyIcon, componentName: string): VaporComponent {
  return cloneWithDefaultProp(SvgIcon, componentName, "icon", icon);
}
