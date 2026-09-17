import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CART_UPDATED_EVENT,
  cartFeedback,
  nextCartQuantity,
  readCart,
  saveCart,
} from "@/components/add-to-cart";

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

describe("product cart feedback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("presents zero, repeated, and maximum-stock quantities explicitly", () => {
    expect(cartFeedback(0, 3)).toMatchObject({
      atMaximum: false,
      buttonLabel: "Add to cart",
      quantity: 0,
      status: "",
    });
    expect(cartFeedback(1, 3)).toMatchObject({
      atMaximum: false,
      buttonLabel: "Add another",
      status: "In cart: 1",
    });
    expect(cartFeedback(3, 3)).toMatchObject({
      atMaximum: true,
      status: "In cart: 3 · Maximum available",
    });
  });

  it("never increments beyond available stock", () => {
    expect(nextCartQuantity(0, 3)).toBe(1);
    expect(nextCartQuantity(1, 3)).toBe(2);
    expect(nextCartQuantity(3, 3)).toBe(3);
  });

  it("reads persisted quantities and emits the same-tab synchronization event", () => {
    const storage = new Map<string, string>();
    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener(CART_UPDATED_EVENT, listener);
    vi.stubGlobal("window", target);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });

    saveCart({ product: 2 });

    expect(readCart()).toEqual({ product: 2 });
    expect(listener).toHaveBeenCalledOnce();
  });
});
