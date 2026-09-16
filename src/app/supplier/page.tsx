import Link from "next/link";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";

export default async function SupplierPage() {
  const actor = await requireProtectedPage(Role.SUPPLIER);
  return (
    <main className="page-shell">
      <AuthenticatedNavigation actor={actor} />
      <p className="eyebrow">Supplier workspace</p>
      <h1>Supplier home</h1>
      <p className="lede">Manage your inventory and fulfill customer orders.</p>
      <section className="portal-grid" aria-label="Supplier shortcuts">
        <Link className="panel portal-card" href="/supplier/products">
          <h2>Manage products</h2>
          <p>Add products, update stock and pricing, or archive listings.</p>
        </Link>
        <Link className="panel portal-card" href="/orders">
          <h2>Supplier orders</h2>
          <p>Review incoming orders and move them through fulfillment.</p>
        </Link>
        <Link className="panel portal-card" href="/products">
          <h2>View catalog</h2>
          <p>See the public shopping experience and active listings.</p>
        </Link>
      </section>
    </main>
  );
}
