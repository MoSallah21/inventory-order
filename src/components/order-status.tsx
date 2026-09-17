import { OrderStatus } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABEL } from "@/modules/orders/presentation";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span aria-hidden="true" className="status-dot" />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
