"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { placeOrderAction, type CheckoutState } from "@/app/orders/actions";
import { readCart, saveCart, type CartRecord } from "@/components/add-to-cart";
import { formatMinorUnits } from "@/lib/money";
import {
  groupCartTotals,
  shouldClearCart,
  suppressCheckoutSubmission,
} from "@/modules/orders/cart";

type Product = {
  id: string;
  name: string;
  formattedPrice: string;
  priceMinor: string;
  currency: string;
  stockQuantity: number;
  supplierName: string;
  imageUrl: string | null;
};

const initialState: CheckoutState = {};

export function Cart({ products }: { products: Product[] }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartRecord>({});
  const [key, setKey] = useState("");
  const [state, action, pending] = useActionState(
    placeOrderAction,
    initialState,
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCart(readCart());
      setKey(crypto.randomUUID().replaceAll("-", ""));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (shouldClearCart(state.success)) {
      saveCart({});
      router.replace("/orders?placed=1");
      router.refresh();
    }
  }, [router, state.success]);
  const selected = useMemo(
    () => (state.success ? [] : products.filter((product) => cart[product.id])),
    [cart, products, state.success],
  );
  const totals = useMemo(
    () => groupCartTotals(selected, cart),
    [cart, selected],
  );
  function update(id: string, raw: string) {
    if (!/^[1-9]\d*$/.test(raw)) return;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > 10_000) return;
    const next = { ...cart, [id]: value };
    setCart(next);
    saveCart(next);
  }
  function remove(id: string) {
    const next = { ...cart };
    delete next[id];
    setCart(next);
    saveCart(next);
  }
  return (
    <form action={action} className="stack">
      <input name="idempotencyKey" type="hidden" value={key} />
      {selected.map((product) => (
        <article className="panel cart-line" key={product.id}>
          <div
            aria-label={`${product.name} product image`}
            className={`cart-image${product.imageUrl ? "" : " product-image-placeholder"}`}
            role="img"
            style={
              product.imageUrl
                ? {
                    backgroundImage: `url(${JSON.stringify(product.imageUrl)})`,
                  }
                : undefined
            }
          >
            {product.imageUrl ? null : "No image"}
          </div>
          <div>
            <strong>{product.name}</strong>
            <p>Supplier: {product.supplierName}</p>
            <p>{product.formattedPrice} each</p>
          </div>
          <input name="productId" type="hidden" value={product.id} />
          <label>
            Quantity{" "}
            <input
              aria-label={`${product.name} quantity`}
              max={10000}
              min={1}
              name="quantity"
              onChange={(event) => update(product.id, event.target.value)}
              required
              step={1}
              type="number"
              value={cart[product.id]}
            />
          </label>
          <div className="cart-line-total">
            <span>Line total</span>
            <strong>
              {formatMinorUnits(
                BigInt(product.priceMinor) * BigInt(cart[product.id]),
                product.currency,
              )}
            </strong>
          </div>
          <button
            className="text-button"
            onClick={() => remove(product.id)}
            type="button"
          >
            Remove
          </button>
        </article>
      ))}
      {!selected.length ? (
        <div className="panel empty-state">
          <p>Your cart is empty.</p>
          <Link className="button-link" href="/products">
            Browse products
          </Link>
        </div>
      ) : null}
      {state.error ? (
        <p className="notice error" role="alert">
          {state.error.message}
        </p>
      ) : null}
      {selected.length ? (
        <>
          <div className="cart-total">
            <span>Total:</span>
            {totals.map((total) => (
              <span key={total.currency}>{total.formatted}</span>
            ))}
          </div>
          <button
            disabled={suppressCheckoutSubmission(pending, key)}
            type="submit"
          >
            {pending ? "Placing order…" : "Place order"}
          </button>
        </>
      ) : null}
    </form>
  );
}
