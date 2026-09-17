"use client";

import Link from "next/link";
import { useState } from "react";

const CART_KEY = "inventory-order-cart-v1";

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
}

export function AddToCart({
  productId,
  disabled,
}: {
  productId: string;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  function add() {
    const cart = readCart();
    cart[productId] = Math.min((cart[productId] ?? 0) + 1, 10_000);
    saveCart(cart);
    setMessage("Added to cart");
  }
  return (
    <span className="cart-control">
      <button disabled={disabled} onClick={add} type="button">
        Add to cart
      </button>
      <span aria-live="polite">
        {message} {message ? <Link href="/cart">View cart</Link> : null}
      </span>
    </span>
  );
}
