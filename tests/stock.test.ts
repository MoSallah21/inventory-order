import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { parseRawStockQuantity, STOCK_MAX } from "@/modules/catalog/stock";

function expectInvalid(value: FormDataEntryValue | null) {
  expect(() => parseRawStockQuantity(value)).toThrowError(
    expect.objectContaining<Partial<AppError>>({
      code: "VALIDATION_FAILED",
      fieldErrors: {
        stockQuantity: [`Stock must be an integer from 0-${STOCK_MAX}.`],
      },
    }),
  );
}

describe("parseRawStockQuantity", () => {
  it.each([
    ["missing", null],
    ["empty", ""],
    ["whitespace only", "  "],
    ["leading whitespace", " 1"],
    ["trailing whitespace", "1 "],
    ["negative", "-1"],
    ["positive sign", "+1"],
    ["fraction", "1.5"],
    ["exponent", "1e2"],
    ["hexadecimal", "0x10"],
    ["binary", "0b10"],
    ["octal", "0o10"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["locale format", "1,000"],
    ["leading zeroes", "01"],
    ["excessive length", "1".repeat(100)],
    ["unsafe integer", String(Number.MAX_SAFE_INTEGER + 1)],
    ["above business bound", String(STOCK_MAX + 1)],
  ] satisfies Array<[string, FormDataEntryValue | null]>)(
    "rejects %s",
    (_label, value) => expectInvalid(value),
  );

  it("rejects File values", () => {
    expectInvalid(new File(["1"], "stock.txt"));
  });

  it("accepts canonical zero and bounded positive integers", () => {
    expect(parseRawStockQuantity("0")).toBe(0);
    expect(parseRawStockQuantity(String(STOCK_MAX))).toBe(STOCK_MAX);
  });
});
