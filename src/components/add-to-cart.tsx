"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const CART_KEY = "inventory-order-cart-v1";
export const CART_UPDATED_EVENT = "inventory-order-cart-updated";

export type CartRecord = Record<string, number>;

export function readCart(): CartRecord {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CART_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as CartRecord) : {};
  } catch {
    return {};
  }
}

export function saveCart(cart: CartRecord) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function nextCartQuantity(current: number, stockQuantity: number) {
  const effectiveLimit = Math.min(Math.max(stockQuantity, 0), 10_000);
  return Math.min(Math.max(current, 0) + 1, effectiveLimit);
}

export function cartFeedback(quantity: number, stockQuantity: number) {
  const normalized =
    Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0;
  const effectiveLimit = Math.min(Math.max(stockQuantity, 0), 10_000);
  const unavailable = normalized > 0 && effectiveLimit === 0;
  const aboveMaximum = normalized > effectiveLimit && effectiveLimit > 0;
  const atMaximum = normalized > 0 && normalized === effectiveLimit;
  return {
    aboveMaximum,
    atMaximum,
    buttonLabel: normalized > 0 ? "Add another" : "Add to cart",
    effectiveLimit,
    guidance: unavailable
      ? "This product is currently unavailable. Review your cart and remove or reduce the existing quantity before checkout."
      : aboveMaximum
        ? "Review your cart and reduce the quantity before checkout."
        : "",
    quantity: normalized,
    unavailable,
    status:
      normalized === 0
        ? ""
        : unavailable
          ? `In cart: ${normalized} · Currently unavailable`
          : aboveMaximum
            ? `In cart: ${normalized} · Only ${effectiveLimit} currently available`
            : `In cart: ${normalized}${atMaximum ? " · Maximum available" : ""}`,
  };
}

export function AddToCart({
  productId,
  stockQuantity,
}: {
  productId: string;
  stockQuantity: number;
}) {
  const [quantity, setQuantity] = useState(0);

  useEffect(() => {
    function synchronize() {
      const stored = readCart()[productId];
      setQuantity(Number.isSafeInteger(stored) && stored > 0 ? stored : 0);
    }

    function synchronizeStorage(event: StorageEvent) {
      if (event.key === null || event.key === CART_KEY) synchronize();
    }

    synchronize();
    window.addEventListener(CART_UPDATED_EVENT, synchronize);
    window.addEventListener("pageshow", synchronize);
    window.addEventListener("storage", synchronizeStorage);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, synchronize);
      window.removeEventListener("pageshow", synchronize);
      window.removeEventListener("storage", synchronizeStorage);
    };
  }, [productId]);

  function add() {
    const cart = readCart();
    const current = Number.isSafeInteger(cart[productId]) ? cart[productId] : 0;
    cart[productId] = nextCartQuantity(current, stockQuantity);
    saveCart(cart);
  }

  const feedback = cartFeedback(quantity, stockQuantity);
  return (
    <span className="cart-control">
      {feedback.quantity === 0 && feedback.effectiveLimit === 0 ? (
        <span className="stock-unavailable">
          Out of stock — unavailable to add
        </span>
      ) : feedback.quantity === 0 ? (
        <button onClick={add} type="button">
          {feedback.buttonLabel}
        </button>
      ) : (
        <>
          <span
            aria-live={
              feedback.aboveMaximum || feedback.unavailable
                ? undefined
                : "polite"
            }
            className={`cart-quantity-status${feedback.aboveMaximum || feedback.unavailable ? " cart-quantity-warning" : ""}`}
            role={
              feedback.aboveMaximum || feedback.unavailable ? "alert" : "status"
            }
          >
            {feedback.status}
          </span>
          {feedback.guidance ? (
            <span className="cart-review-guidance">{feedback.guidance}</span>
          ) : null}
          {!feedback.atMaximum &&
          !feedback.aboveMaximum &&
          !feedback.unavailable ? (
            <button onClick={add} type="button">
              {feedback.buttonLabel}
            </button>
          ) : null}
          <Link href="/cart">View cart</Link>
        </>
      )}
    </span>
  );
}
