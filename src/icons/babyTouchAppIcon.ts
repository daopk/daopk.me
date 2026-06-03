import { defineComponent, h } from "vue";

import babyTouchAppIconUrl from "~/assets/icons/baby-touch-app-icon.png";
import "./babyTouchAppIcon.css";

type IconSize = number | string;

function sizeToCssValue(size: IconSize): string {
  return typeof size === "number" ? `${size}px` : size;
}

export const BabyTouchAppIcon = defineComponent({
  name: "BabyTouchAppIcon",
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
      const { class: className, style, ...restAttrs } = attrs;
      const sizeStyle =
        props.size === undefined
          ? undefined
          : {
              "--baby-touch-app-icon-size": sizeToCssValue(props.size),
              blockSize: "var(--baby-touch-app-icon-render-size, var(--baby-touch-app-icon-size))",
              inlineSize: "var(--baby-touch-app-icon-render-size, var(--baby-touch-app-icon-size))",
            };

      return h("img", {
        ...restAttrs,
        alt: "",
        class: ["baby-touch-app-icon", className],
        decoding: "async",
        draggable: "false",
        src: babyTouchAppIconUrl,
        style: [{ display: "block", objectFit: "cover" }, sizeStyle, style],
      });
    };
  },
});
