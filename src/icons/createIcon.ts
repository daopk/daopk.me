import { markRaw, type VaporComponent } from "vue";

import ImageIcon from "./ImageIcon.vue";

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
  propName: "src",
  defaultValue: string,
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
        default: defaultValue,
      },
    },
  }) as VaporComponent;
}

/** Build a Vapor glyph that renders app-owned image artwork through an `<img>`. */
export function createImageIcon(src: string, componentName: string): VaporComponent {
  return cloneWithDefaultProp(ImageIcon, componentName, "src", src);
}
