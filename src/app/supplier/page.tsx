import Link from "next/link";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { PageHeader } from "@/components/page-header";
import { AppIcon } from "@/components/app-icon";

export default async function SupplierPage() {
  const actor = await requireProtectedPage(Role.SUPPLIER);
  return (
    <main className="page-shell workspace-page" id="workspace-content">
      <AuthenticatedNavigation actor={actor} />
      <PageHeader
        eyebrow="Supplier operations"
        title="Inventory workspace"
        description="Maintain sellable inventory and move customer orders through fulfillment."
      />
      <section className="portal-grid" aria-label="Supplier shortcuts">
        <Link className="panel portal-card" href="/supplier/products">
          <AppIcon name="products" />
          <h2>Manage products</h2>
          <p>Add products, update stock and pricing, or archive listings.</p>
        </Link>
        <Link className="panel portal-card" href="/orders">
          <AppIcon name="orders" />
          <h2>Supplier orders</h2>
          <p>Review incoming orders and move them through fulfillment.</p>
        </Link>
        <Link className="panel portal-card" href="/products">
          <AppIcon name="dashboard" />
          <h2>View catalog</h2>
          <p>See the public shopping experience and active listings.</p>
        </Link>
      </section>
    </main>
  );
}
