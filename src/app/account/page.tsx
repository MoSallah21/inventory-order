import Link from "next/link";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";

export default async function AccountPage() {
  const actor = await requireProtectedPage(Role.CUSTOMER);
  return (
    <main className="page-shell">
      <AuthenticatedNavigation actor={actor} />
      <p className="eyebrow">Customer account</p>
      <h1>Welcome, {actor.name}</h1>
      <p className="lede">Browse inventory and keep track of your purchases.</p>
      <section className="portal-grid" aria-label="Customer shortcuts">
        <Link className="panel portal-card" href="/products">
          <h2>Browse products</h2>
          <p>Explore available products from active suppliers.</p>
        </Link>
        <Link className="panel portal-card" href="/cart">
          <h2>Cart</h2>
          <p>Review quantities and complete your checkout.</p>
        </Link>
        <Link className="panel portal-card" href="/orders">
          <h2>Customer orders</h2>
          <p>Review your order history and current statuses.</p>
        </Link>
      </section>
    </main>
  );
}
