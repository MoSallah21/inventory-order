import { formatMinorUnits } from "@/lib/money";

export type CartQuantityMap = Readonly<Record<string, number>>;
export type CartPricedProduct = {
  id: string;
  priceMinor: string;
  currency: string;
};

export function groupCartTotals(
  products: readonly CartPricedProduct[],
  quantities: CartQuantityMap,
) {
  const totals = new Map<string, bigint>();
  for (const product of products) {
    const quantity = quantities[product.id];
    if (!quantity) continue;
    const line = BigInt(product.priceMinor) * BigInt(quantity);
    totals.set(product.currency, (totals.get(product.currency) ?? 0n) + line);
  }
  return [...totals]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amountMinor]) => ({
      currency,
      amountMinor: amountMinor.toString(),
      formatted: formatMinorUnits(amountMinor, currency),
    }));
}

export function checkoutPayload(
  idempotencyKey: string,
  quantities: CartQuantityMap,
) {
  return {
    idempotencyKey,
    items: Object.entries(quantities).map(([productId, quantity]) => ({
      productId,
      quantity: String(quantity),
    })),
  };
}

export function shouldClearCart(success: boolean | undefined) {
  return success === true;
}

export function suppressCheckoutSubmission(
  pending: boolean,
  idempotencyKey: string,
) {
  return pending || idempotencyKey.length === 0;
}
