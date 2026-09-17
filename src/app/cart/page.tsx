import Link from "next/link";
import { connection } from "next/server";

import { Cart } from "@/components/cart";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listPublicProducts } from "@/modules/catalog/service";

export default async function CartPage() {
  await connection();
  const actor = await requireProtectedPage(Role.CUSTOMER);
  const products = (await listPublicProducts()).map((product) => ({
    id: product.id,
    name: product.name,
    formattedPrice: product.formattedPrice,
    priceMinor: product.priceMinor.toString(),
    currency: product.currency,
    stockQuantity: product.stockQuantity,
    supplierName: product.supplierName,
    imageUrl: product.imageUrl,
  }));
  return (
    <main className="page-shell narrow">
      <AuthenticatedNavigation actor={actor} />
      <Link className="back-link" href="/products">
        ← Continue shopping
      </Link>
      <p className="eyebrow">Customer checkout</p>
      <h1>Your cart</h1>
      <p className="lede">
        Review quantities before placing one atomic checkout.
      </p>
      <Cart products={products} />
    </main>
  );
}
