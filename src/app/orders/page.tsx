import Link from "next/link";
import { connection } from "next/server";

import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { OrderStatusBadge } from "@/components/order-status";
import { Role } from "@/generated/prisma/enums";
import { parsePage, type QueryValue } from "@/lib/pagination";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listOrdersPage } from "@/modules/orders/service";
import { formatOrderDate } from "@/modules/orders/presentation";

type Props = {
  searchParams: Promise<{ placed?: QueryValue; page?: QueryValue }>;
};

export default async function OrdersPage({ searchParams }: Props) {
  await connection();
  const actor = await requireProtectedPage(
    Role.ADMIN,
    Role.SUPPLIER,
    Role.CUSTOMER,
  );
  const query = await searchParams;
  const result = await listOrdersPage(actor, parsePage(query.page));
  const { orders } = result;
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (typeof query.placed === "string" && query.placed)
      params.set("placed", query.placed);
    if (page > 1) params.set("page", String(page));
    const suffix = params.toString();
    return suffix ? `/orders?${suffix}` : "/orders";
  };
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
      {actor.role === Role.ADMIN ? (
        <p>
          <Link className="button-link secondary" href="/orders/export">
            Export orders CSV
          </Link>
        </p>
      ) : null}
      {query.placed ? (
        <p className="notice success" role="status">
          Order placed successfully. Its current status is shown below.
        </p>
      ) : null}
      <nav aria-label="Order pages" className="pagination">
        <span>
          Page {result.page} of {result.pageCount} · {result.totalCount} orders
        </span>
        <div>
          {result.page > 1 ? (
            <Link
              className="button-link secondary"
              href={pageHref(result.page - 1)}
            >
              Previous
            </Link>
          ) : null}
          {result.page < result.pageCount ? (
            <Link
              className="button-link secondary"
              href={pageHref(result.page + 1)}
            >
              Next
            </Link>
          ) : null}
        </div>
      </nav>
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
