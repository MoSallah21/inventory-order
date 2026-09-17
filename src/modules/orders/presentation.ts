import { OrderStatus, Role } from "@/generated/prisma/enums";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: "Pending",
  [OrderStatus.CONFIRMED]: "Confirmed",
  [OrderStatus.SHIPPED]: "Shipped",
  [OrderStatus.DELIVERED]: "Delivered",
  [OrderStatus.CANCELLED]: "Cancelled",
};

export const ORDER_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.CONFIRMED]: "Confirm order",
  [OrderStatus.SHIPPED]: "Mark as shipped",
  [OrderStatus.DELIVERED]: "Mark as delivered",
  [OrderStatus.CANCELLED]: "Cancel order",
};

export function orderStateMessage(role: Role, status: OrderStatus) {
  if (status === OrderStatus.DELIVERED) return "This order has been delivered.";
  if (status === OrderStatus.CANCELLED)
    return "This order was cancelled and stock was restored.";
  if (role === Role.CUSTOMER && status === OrderStatus.CONFIRMED)
    return "The supplier has confirmed this order.";
  if (role === Role.CUSTOMER && status === OrderStatus.SHIPPED)
    return "This order is on its way.";
  return null;
}

export function formatOrderDate(value: Date) {
  return new Intl.DateTimeFormat("en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}
