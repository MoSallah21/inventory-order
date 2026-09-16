import { describe, expect, it } from "vitest";

import {
  addMinorUnits,
  formatMinorUnits,
  multiplyMinorUnits,
  POSTGRES_BIGINT_MAX,
} from "@/lib/money";

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

  it("accepts the PostgreSQL BIGINT multiplication boundary", () => {
    expect(multiplyMinorUnits(POSTGRES_BIGINT_MAX, 1)).toBe(
      POSTGRES_BIGINT_MAX,
    );
    expect(multiplyMinorUnits(POSTGRES_BIGINT_MAX / 3n, 3)).toBe(
      (POSTGRES_BIGINT_MAX / 3n) * 3n,
    );
  });

  it("rejects multiplication and accumulation overflow safely", () => {
    expect(() => multiplyMinorUnits(POSTGRES_BIGINT_MAX / 2n + 1n, 2)).toThrow(
      "above the supported maximum",
    );
    expect(() => addMinorUnits(POSTGRES_BIGINT_MAX, 1n)).toThrow(
      "above the supported maximum",
    );
  });
});
