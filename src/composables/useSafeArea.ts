import { onMounted, onUnmounted, ref, type Ref } from "vue";

interface UseSafeArea {
  readonly top: Ref<number>;
  readonly right: Ref<number>;
  readonly bottom: Ref<number>;
  readonly left: Ref<number>;
}

const PROBE_STYLE = [
  "position:fixed",
  "top:0",
  "left:0",
  "visibility:hidden",
  "pointer-events:none",
  "padding-top:env(safe-area-inset-top, 0px)",
  "padding-right:env(safe-area-inset-right, 0px)",
  "padding-bottom:env(safe-area-inset-bottom, 0px)",
  "padding-left:env(safe-area-inset-left, 0px)",
].join(";");

export function useSafeArea(): UseSafeArea {
  const top = ref(0);
  const right = ref(0);
  const bottom = ref(0);
  const left = ref(0);

  if (typeof document === "undefined") {
    return { top, right, bottom, left };
  }

  let probe: HTMLDivElement | undefined;
  let onResize: (() => void) | undefined;

  function measure(): void {
    if (!probe) {
      return;
    }

    const cs = getComputedStyle(probe);
    top.value = parsePx(cs.paddingTop);
    right.value = parsePx(cs.paddingRight);
    bottom.value = parsePx(cs.paddingBottom);
    left.value = parsePx(cs.paddingLeft);
  }

  onMounted(() => {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.setAttribute("style", PROBE_STYLE);
    document.body.appendChild(probe);

    measure();

    onResize = (): void => {
      measure();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
  });

  onUnmounted(() => {
    if (onResize) {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    }

    if (probe && probe.parentNode) {
      probe.parentNode.removeChild(probe);
    }

    probe = undefined;
    onResize = undefined;
  });

  return { top, right, bottom, left };
}

function parsePx(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
