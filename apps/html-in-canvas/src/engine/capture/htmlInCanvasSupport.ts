export interface HtmlInCanvasSupport {
  readonly supported: boolean;
  readonly missingFeatures: readonly string[];
}

interface HtmlInCanvasEnvironment {
  readonly HTMLCanvasElement?: {
    readonly prototype?: object;
  };
  readonly CanvasRenderingContext2D?: {
    readonly prototype?: object;
  };
}

const FEATURE_LABELS = {
  layoutSubtree: "canvas layoutsubtree",
  requestPaint: "canvas requestPaint()",
  drawElementImage: "2D canvas drawElementImage()",
} as const;

function hasCallableFeature(prototype: object | undefined, property: string): boolean {
  return (
    prototype !== undefined &&
    property in prototype &&
    typeof (prototype as Record<string, unknown>)[property] === "function"
  );
}

function hasLayoutSubtreeFeature(prototype: object | undefined): boolean {
  if (prototype === undefined) {
    return false;
  }

  return "layoutSubtree" in prototype || "layoutsubtree" in prototype;
}

export function detectHtmlInCanvasSupport(
  environment: HtmlInCanvasEnvironment = globalThis,
): HtmlInCanvasSupport {
  const canvasPrototype = environment.HTMLCanvasElement?.prototype;
  const context2dPrototype = environment.CanvasRenderingContext2D?.prototype;
  const missingFeatures: string[] = [];

  if (!hasLayoutSubtreeFeature(canvasPrototype)) {
    missingFeatures.push(FEATURE_LABELS.layoutSubtree);
  }
  if (!hasCallableFeature(canvasPrototype, "requestPaint")) {
    missingFeatures.push(FEATURE_LABELS.requestPaint);
  }
  if (!hasCallableFeature(context2dPrototype, "drawElementImage")) {
    missingFeatures.push(FEATURE_LABELS.drawElementImage);
  }

  return {
    supported: missingFeatures.length === 0,
    missingFeatures,
  };
}
