import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import DataTable from "./DataTable.vue";

describe("DataTable", () => {
  it("exposes table semantics and the plain variant by default", () => {
    const table = mount(DataTable, {
      props: { label: "Deleted items" },
      slots: { default: '<div role="row">Row</div>' },
    });
    expect(table.attributes("role")).toBe("table");
    expect(table.attributes("aria-label")).toBe("Deleted items");
    expect(table.classes()).toContain("ds-kit-data-table--plain");
  });

  it("applies the lined variant", () => {
    const lined = mount(DataTable, { props: { label: "Recent files", variant: "lined" } });
    expect(lined.classes()).toContain("ds-kit-data-table--lined");
  });
});
