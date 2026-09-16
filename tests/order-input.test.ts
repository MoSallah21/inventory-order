import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  ORDER_LINE_MAX,
  ORDER_QUANTITY_MAX,
  parseOrderFormData,
  parseOrderQuantity,
  parseOrderSubmission,
} from "@/modules/orders/input";

function invalidQuantity(value: unknown) {
  expect(() => parseOrderQuantity(value)).toThrowError(
    expect.objectContaining<Partial<AppError>>({ code: "VALIDATION_FAILED" }),
  );
}

describe("order input boundary", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace", " "],
    ["zero", "0"],
    ["negative", "-1"],
    ["signed", "+1"],
    ["fraction", "1.5"],
    ["exponent", "1e2"],
    ["hex", "0x10"],
    ["leading zero", "01"],
    ["locale", "1,000"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["unsafe", String(Number.MAX_SAFE_INTEGER + 1)],
    ["oversized", String(ORDER_QUANTITY_MAX + 1)],
  ])("rejects %s quantity", (_label, value) => invalidQuantity(value));

  it("accepts canonical bounded positive quantities", () => {
    expect(parseOrderQuantity("1")).toBe(1);
    expect(parseOrderQuantity(String(ORDER_QUANTITY_MAX))).toBe(
      ORDER_QUANTITY_MAX,
    );
  });

  it("rejects missing and empty items", () => {
    const base = { idempotencyKey: "request_key_123456" };
    expect(() =>
      parseOrderSubmission({ ...base, items: undefined }),
    ).toThrowError(AppError);
    expect(() => parseOrderSubmission({ ...base, items: [] })).toThrowError(
      AppError,
    );
  });

  it("rejects duplicates, missing quantities, and excessive lines", () => {
    const idempotencyKey = "request_key_123456";
    expect(() =>
      parseOrderSubmission({
        idempotencyKey,
        items: [
          { productId: "a", quantity: "1" },
          { productId: "a", quantity: "2" },
        ],
      }),
    ).toThrowError(AppError);
    expect(() =>
      parseOrderSubmission({
        idempotencyKey,
        items: [{ productId: "a", quantity: undefined }],
      }),
    ).toThrowError(AppError);
    expect(() =>
      parseOrderSubmission({
        idempotencyKey,
        items: Array.from({ length: ORDER_LINE_MAX + 1 }, (_, index) => ({
          productId: `p-${index}`,
          quantity: "1",
        })),
      }),
    ).toThrowError(AppError);
  });

  it("returns only normalized safe fields", () => {
    expect(
      parseOrderSubmission({
        idempotencyKey: "request_key_123456",
        items: [{ productId: "product-1", quantity: "2", price: "0" }],
      }),
    ).toEqual({
      idempotencyKey: "request_key_123456",
      items: [{ productId: "product-1", quantity: 2 }],
    });
  });

  it("rejects File values and mismatched repeated fields", () => {
    const fileData = new FormData();
    fileData.set("idempotencyKey", "request_key_123456");
    fileData.set("productId", new File(["product-1"], "product.txt"));
    fileData.set("quantity", "1");
    expect(() => parseOrderFormData(fileData)).toThrowError(AppError);

    const mismatched = new FormData();
    mismatched.set("idempotencyKey", "request_key_123456");
    mismatched.append("productId", "product-1");
    mismatched.append("productId", "product-2");
    mismatched.append("quantity", "1");
    expect(() => parseOrderFormData(mismatched)).toThrowError(AppError);
  });
});
