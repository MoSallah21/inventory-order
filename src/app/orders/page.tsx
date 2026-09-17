import Link from "next/link";
import { connection } from "next/server";

import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { OrderStatusBadge } from "@/components/order-status";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listOrders } from "@/modules/orders/service";
import { formatOrderDate } from "@/modules/orders/presentation";

type Props = { searchParams: Promise<{ placed?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  await connection();
  const actor = await requireProtectedPage(
    Role.ADMIN,
    Role.SUPPLIER,
    Role.CUSTOMER,
  );
  const [orders, query] = await Promise.all([listOrders(actor), searchParams]);
  return (
    <main className="page-shell">
      <AuthenticatedNavigation actor={actor} />
      <p className="eyebrow">{actor.role.toLowerCase()} orders</p>
      <h1>Orders</h1>
      <p className="lede">
        {actor.role === Role.CUSTOMER
          ? "Track purchases and review their current status."
          : "Review orders and take the next allowed fulfillment action."}
      </p>
      {query.placed ? (
        <p className="notice success" role="status">
          Order placed successfully. Its current status is shown below.
        </p>
      ) : null}
      <div className="stack">
        {orders.map((order) => (
          <article className="panel order-card" key={order.id}>
            <div>
              <OrderStatusBadge status={order.status} />
              <h2>
                <Link href={`/orders/${order.id}`}>
                  Order {order.id.slice(-8)}
                </Link>
              </h2>
              <p>
                {actor.role === "CUSTOMER"
                  ? `Supplier: ${order.supplier.name}`
                  : actor.role === "SUPPLIER"
                    ? `Customer: ${order.customer.name}`
                    : `Customer: ${order.customer.name} · Supplier: ${order.supplier.name}`}
              </p>
              <p className="hint">
                Created {formatOrderDate(order.createdAt)} UTC
              </p>
            </div>
            <div className="order-card-actions">
              <strong>{order.formattedTotal}</strong>
              <Link
                className="button-link secondary"
                href={`/orders/${order.id}`}
              >
                View order
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!orders.length ? (
        <div className="panel empty-state">
          <p>
            {actor.role === Role.CUSTOMER
              ? "You have not placed any orders yet."
              : actor.role === Role.SUPPLIER
                ? "No customer orders have been placed for your products yet."
                : "No orders have been placed yet."}
          </p>
          <Link
            className="button-link secondary"
            href={
              actor.role === Role.SUPPLIER ? "/supplier/products" : "/products"
            }
          >
            {actor.role === Role.SUPPLIER
              ? "Manage products"
              : "Browse products"}
          </Link>
        </div>
      ) : null}
    </main>
  );
}
