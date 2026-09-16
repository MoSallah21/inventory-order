import { describe, expect, it } from "vitest";

import {
  checkoutPayload,
  groupCartTotals,
  shouldClearCart,
  suppressCheckoutSubmission,
} from "@/modules/orders/cart";

describe("cart totals", () => {
  it("renders one currency using integer minor units", () => {
    expect(
      groupCartTotals([{ id: "a", priceMinor: "5000", currency: "AED" }], {
        a: 2,
      }),
    ).toEqual([
      { currency: "AED", amountMinor: "10000", formatted: "AED 100.00" },
    ]);
  });

  it("keeps mixed currencies in separate totals", () => {
    expect(
      groupCartTotals(
        [
          { id: "aed", priceMinor: "10000", currency: "AED" },
          { id: "usd", priceMinor: "2500", currency: "USD" },
        ],
        { aed: 1, usd: 1 },
      ),
    ).toEqual([
      { currency: "AED", amountMinor: "10000", formatted: "AED 100.00" },
      { currency: "USD", amountMinor: "2500", formatted: "USD 25.00" },
    ]);
  });

  it("submits only product IDs and quantities, never price or currency", () => {
    const payload = checkoutPayload("request_key_123456", { a: 2 });
    expect(payload).toEqual({
      idempotencyKey: "request_key_123456",
      items: [{ productId: "a", quantity: "2" }],
    });
    expect(payload.items[0]).not.toHaveProperty("priceMinor");
    expect(payload.items[0]).not.toHaveProperty("currency");
  });

  it("clears only after success and suppresses duplicate submission", () => {
    expect(shouldClearCart(undefined)).toBe(false);
    expect(shouldClearCart(false)).toBe(false);
    expect(shouldClearCart(true)).toBe(true);
    expect(suppressCheckoutSubmission(true, "request_key_123456")).toBe(true);
    expect(suppressCheckoutSubmission(false, "")).toBe(true);
    expect(suppressCheckoutSubmission(false, "request_key_123456")).toBe(false);
  });
});
