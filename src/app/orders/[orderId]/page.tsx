import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { OrderActionForm } from "@/components/order-action-form";
import { OrderStatusBadge } from "@/components/order-status";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { allowedTargets, getOrder } from "@/modules/orders/service";
import {
  formatOrderDate,
  orderStateMessage,
} from "@/modules/orders/presentation";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { orderId } = await params;
  const query = await searchParams;
  const actor = await requireProtectedPage(
    Role.ADMIN,
    Role.SUPPLIER,
    Role.CUSTOMER,
  );
  const order = await getOrder(actor, orderId);
  const targets = allowedTargets(actor.role, order.status);
  const lastUpdated =
    order.cancelledAt ??
    order.deliveredAt ??
    order.shippedAt ??
    order.confirmedAt ??
    order.createdAt;
  return (
    <main className="page-shell narrow">
      <AuthenticatedNavigation actor={actor} />
      <Link className="back-link" href="/orders">
        ← Back to orders
      </Link>
      <p className="eyebrow">Order detail</p>
      <h1>Order {order.id.slice(-8)}</h1>
      {query.error ? (
        <p className="notice error" role="alert">
          {query.error}
        </p>
      ) : null}
      {query.saved ? (
        <p className="notice success" role="status">
          Order updated successfully.
        </p>
      ) : null}
      <section
        className="panel order-summary"
        aria-labelledby="order-status-heading"
      >
        <div>
          <p className="eyebrow" id="order-status-heading">
            Current status
          </p>
          <OrderStatusBadge status={order.status} />
          <p className="hint">
            Last updated {formatOrderDate(lastUpdated)} UTC
          </p>
        </div>
        <strong className="order-total">{order.formattedTotal}</strong>
        {targets.length ? (
          <div className="order-actions">
            <h2>Available actions</h2>
            <div className="action-row">
              {targets.map((target) => (
                <OrderActionForm
                  key={target}
                  orderId={order.id}
                  target={target}
                />
              ))}
            </div>
          </div>
        ) : orderStateMessage(actor.role, order.status) ? (
          <p className="state-message">
            {orderStateMessage(actor.role, order.status)}
          </p>
        ) : null}
      </section>
      <section className="detail-card">
        <h2>Order items</h2>
        <p>Customer: {order.customer.name}</p>
        <p>Supplier: {order.supplier.name}</p>
        {order.items.map((item) => (
          <div className="order-line row" key={item.id}>
            <div>
              <strong>{item.productNameSnapshot}</strong>
              <p>
                {item.formattedUnitPrice} × {item.quantity}
              </p>
            </div>
            <strong>{item.formattedLineTotal}</strong>
          </div>
        ))}
      </section>
    </main>
  );
}
