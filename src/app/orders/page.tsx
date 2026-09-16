import Link from "next/link";
import { connection } from "next/server";

import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listOrders } from "@/modules/orders/service";

export default async function OrdersPage() {
  await connection();
  const actor = await requireProtectedPage(
    Role.ADMIN,
    Role.SUPPLIER,
    Role.CUSTOMER,
  );
  const orders = await listOrders(actor);
  return (
    <main className="page-shell">
      <AuthenticatedNavigation actor={actor} />
      <p className="eyebrow">{actor.role.toLowerCase()} orders</p>
      <h1>Orders</h1>
      <div className="stack">
        {orders.map((order) => (
          <article className="panel row" key={order.id}>
            <div>
              <span className="badge">{order.status}</span>
              <h2>
                <Link href={`/orders/${order.id}`}>
                  Order {order.id.slice(-8)}
                </Link>
              </h2>
              <p>
                {actor.role === "CUSTOMER"
                  ? `Supplier: ${order.supplier.name}`
                  : `Customer: ${order.customer.name}`}
              </p>
            </div>
            <strong>{order.formattedTotal}</strong>
          </article>
        ))}
      </div>
      {!orders.length ? <p className="empty">No orders found.</p> : null}
    </main>
  );
}
