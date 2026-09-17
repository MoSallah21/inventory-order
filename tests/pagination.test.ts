import { describe, expect, it } from "vitest";

import { clampPage, parsePage } from "@/lib/pagination";
import { parsePublicProductFilters } from "@/modules/catalog/service";

describe("query pagination", () => {
  it("accepts only canonical bounded positive integers", () => {
    expect(parsePage("2")).toBe(2);
    for (const value of [
      "0",
      "-1",
      "1.5",
      "1e2",
      "0x10",
      "01",
      "1000001",
      ["1", "2"],
    ]) {
      expect(parsePage(value)).toBe(1);
    }
  });

  it("clamps pages beyond the result set", () => {
    expect(clampPage(99, 21)).toBe(3);
    expect(clampPage(99, 0)).toBe(1);
  });
});

describe("public product filter parsing", () => {
  it("converts exact price boundaries without floating point", () => {
    const filters = parsePublicProductFilters({
      minPrice: "0.01",
      maxPrice: "9999999.99",
    });
    expect(filters.minPriceMinor).toBe(1n);
    expect(filters.maxPriceMinor).toBe(999_999_999n);
  });

  it("normalizes malformed, repeated, and inverted filters safely", () => {
    expect(parsePublicProductFilters({ minPrice: "1e2" }).error).toMatch(
      /non-negative/,
    );
    expect(parsePublicProductFilters({ minPrice: ["1", "2"] }).minPrice).toBe(
      "",
    );
    expect(
      parsePublicProductFilters({ minPrice: "2", maxPrice: "1" }).error,
    ).toMatch(/cannot exceed/);
    expect(parsePublicProductFilters({ inStock: "false" }).inStock).toBe(false);
  });
});
