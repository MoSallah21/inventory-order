"use client";

import { useFormStatus } from "react-dom";

import { transitionOrderAction } from "@/app/orders/actions";
import { OrderStatus } from "@/generated/prisma/enums";
import { ORDER_ACTION_LABEL } from "@/modules/orders/presentation";

function ActionButton({ target }: { target: OrderStatus }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={target === OrderStatus.CANCELLED ? "danger" : ""}
      disabled={pending}
      type="submit"
    >
      {pending ? "Updating order…" : ORDER_ACTION_LABEL[target]}
    </button>
  );
}

export function OrderActionForm({
  orderId,
  target,
}: {
  orderId: string;
  target: OrderStatus;
}) {
  return (
    <form action={transitionOrderAction}>
      <input name="orderId" type="hidden" value={orderId} />
      <input name="target" type="hidden" value={target} />
      <ActionButton target={target} />
    </form>
  );
}
