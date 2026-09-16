"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { OrderStatus, Role } from "@/generated/prisma/enums";
import { serializeError, type BrowserError } from "@/lib/errors";
import {
  requireAuthenticatedActor,
  requireRole,
} from "@/modules/auth/authorization";
import { parseOrderFormData } from "@/modules/orders/input";
import { placeOrder, transitionOrder } from "@/modules/orders/service";

export type CheckoutState = { error?: BrowserError; success?: boolean };

export async function placeOrderAction(
  _state: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  try {
    const input = parseOrderFormData(formData);
    await placeOrder(await requireRole(Role.CUSTOMER), {
      idempotencyKey: input.idempotencyKey,
      items: input.items.map((item) => ({
        productId: item.productId,
        quantity: String(item.quantity),
      })),
    });
  } catch (error) {
    return { error: serializeError(error) };
  }
  revalidatePath("/orders");
  revalidatePath("/products");
  return { success: true };
}

export async function transitionOrderAction(formData: FormData) {
  const id = String(formData.get("orderId") ?? "");
  const target = String(formData.get("target") ?? "") as OrderStatus;
  let error: BrowserError | undefined;
  try {
    await transitionOrder(await requireAuthenticatedActor(), id, target);
  } catch (caught) {
    error = serializeError(caught);
  }
  const path = `/orders/${encodeURIComponent(id)}`;
  if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(path);
  revalidatePath("/orders");
  revalidatePath("/products");
  redirect(`${path}?saved=1`);
}
