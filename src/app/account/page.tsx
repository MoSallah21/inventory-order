import Link from "next/link";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { PageHeader } from "@/components/page-header";
import { AppIcon } from "@/components/app-icon";

export default async function AccountPage() {
  const actor = await requireProtectedPage(Role.CUSTOMER);
  return (
    <main className="page-shell workspace-page" id="workspace-content">
      <AuthenticatedNavigation actor={actor} />
      <PageHeader
        eyebrow="Customer workspace"
        title={<>Welcome, {actor.name}</>}
        description="Browse current inventory, prepare your cart, and follow every order from one place."
      />
      <section className="portal-grid" aria-label="Customer shortcuts">
        <Link className="panel portal-card" href="/products">
          <AppIcon name="products" />
          <h2>Browse products</h2>
          <p>Explore available products from active suppliers.</p>
        </Link>
        <Link className="panel portal-card" href="/cart">
          <AppIcon name="cart" />
          <h2>Cart</h2>
          <p>Review quantities and complete your checkout.</p>
        </Link>
        <Link className="panel portal-card" href="/orders">
          <AppIcon name="orders" />
          <h2>Customer orders</h2>
          <p>Review your order history and current statuses.</p>
        </Link>
      </section>
    </main>
  );
}
