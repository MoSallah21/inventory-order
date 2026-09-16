import Link from "next/link";

import { transitionOrderAction } from "@/app/orders/actions";
import { requireAuthenticatedActor } from "@/modules/auth/authorization";
import { allowedTargets, getOrder } from "@/modules/orders/service";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { orderId } = await params;
  const query = await searchParams;
  const actor = await requireAuthenticatedActor();
  const order = await getOrder(actor, orderId);
  const targets = allowedTargets(actor.role, order.status);
  return (
    <main className="page-shell narrow">
      <nav className="top-nav">
        <Link href="/orders">All orders</Link>
        <Link href="/products">Products</Link>
      </nav>
      <p className="eyebrow">Order detail</p>
      <h1>Order {order.id.slice(-8)}</h1>
      {query.error ? <p className="notice error">{query.error}</p> : null}
      {query.saved ? <p className="notice success">Order updated.</p> : null}
      <section className="detail-card">
        <div className="row">
          <span className="badge">{order.status}</span>
          <strong>{order.formattedTotal}</strong>
        </div>
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
      {targets.length ? (
        <section className="panel">
          <h2>Available actions</h2>
          <div className="action-row">
            {targets.map((target) => (
              <form action={transitionOrderAction} key={target}>
                <input name="orderId" type="hidden" value={order.id} />
                <input name="target" type="hidden" value={target} />
                <button
                  className={target === "CANCELLED" ? "secondary" : ""}
                  type="submit"
                >
                  {target === "CANCELLED"
                    ? "Cancel order"
                    : `Mark ${target.toLowerCase()}`}
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
