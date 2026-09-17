import Link from "next/link";
import { connection } from "next/server";

import { Cart } from "@/components/cart";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listPublicProducts } from "@/modules/catalog/service";
import { PageHeader } from "@/components/page-header";

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
    <main className="page-shell workspace-page" id="workspace-content">
      <AuthenticatedNavigation actor={actor} />
      <PageHeader
        eyebrow="Customer checkout"
        title="Cart review"
        description="Confirm quantities and availability before placing one atomic checkout."
        actions={
          <Link className="button-link secondary" href="/products">
            Continue shopping
          </Link>
        }
      />
      <Cart products={products} />
    </main>
  );
}
