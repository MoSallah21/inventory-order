import Link from "next/link";
import { connection } from "next/server";

import { Cart } from "@/components/cart";
import { listPublicProducts } from "@/modules/catalog/service";

export default async function CartPage() {
  await connection();
  const products = (await listPublicProducts()).map((product) => ({
    id: product.id,
    name: product.name,
    formattedPrice: product.formattedPrice,
    priceMinor: product.priceMinor.toString(),
    currency: product.currency,
    stockQuantity: product.stockQuantity,
  }));
  return (
    <main className="page-shell narrow">
      <nav className="top-nav">
        <Link href="/products">Products</Link>
        <Link href="/orders">Orders</Link>
      </nav>
      <p className="eyebrow">Customer checkout</p>
      <h1>Your cart</h1>
      <p className="lede">
        Review quantities before placing one atomic checkout.
      </p>
      <Cart products={products} />
    </main>
  );
}
