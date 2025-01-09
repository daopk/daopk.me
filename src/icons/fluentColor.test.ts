import { describe, expect, it } from "vitest";

import {
  FLUENT_COLOR_ICON_NAMES,
  fluentColorIconComponents,
  type FluentColorIconName,
} from "./fluentColor";
import { fluentColorIconData } from "./generated/fluentColor";

describe("Fluent Color icon subset", () => {
  it("contains data for every mapped icon name", () => {
    for (const name of FLUENT_COLOR_ICON_NAMES) {
      const icon = fluentColorIconData[name as FluentColorIconName];

      expect(icon).toBeDefined();
      expect(icon.body).toContain("<");
    }
  });

  it("exports renderable Vue components for every identity icon", () => {
    for (const component of Object.values(fluentColorIconComponents)) {
      expect(component).toBeTruthy();
    }
  });
});
