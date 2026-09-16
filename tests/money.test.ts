import { describe, expect, it } from "vitest";

import { formatMinorUnits, multiplyMinorUnits } from "@/lib/money";

describe("minor-unit money helpers", () => {
  it("multiplies without floating-point arithmetic", () => {
    expect(multiplyMinorUnits(1_999n, 3)).toBe(5_997n);
  });

  it("formats positive, zero, and negative values", () => {
    expect(formatMinorUnits(12_345n)).toBe("AED 123.45");
    expect(formatMinorUnits(0n)).toBe("AED 0.00");
    expect(formatMinorUnits(-5n, "USD")).toBe("-USD 0.05");
  });

  it.each([
    [-1n, 1],
    [1n, 0],
    [1n, 1.5],
  ] as const)("rejects invalid inputs", (amount, quantity) => {
    expect(() => multiplyMinorUnits(amount, quantity)).toThrow(
      "Money inputs are invalid.",
    );
  });
});
