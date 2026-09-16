import { beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  placeOrder: vi.fn(),
  transitionOrder: vi.fn(),
  requireRole: vi.fn(),
  requireAuthenticatedActor: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/authorization", () => ({
  requireRole: mocks.requireRole,
  requireAuthenticatedActor: mocks.requireAuthenticatedActor,
}));
vi.mock("@/modules/orders/service", () => ({
  placeOrder: mocks.placeOrder,
  transitionOrder: mocks.transitionOrder,
}));

import { placeOrderAction, transitionOrderAction } from "@/app/orders/actions";

describe("order server action boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({
      id: "customer",
      role: Role.CUSTOMER,
    });
    mocks.requireAuthenticatedActor.mockResolvedValue({
      id: "supplier",
      role: Role.SUPPLIER,
    });
    mocks.placeOrder.mockResolvedValue({
      checkoutGroupId: "group",
      repeated: false,
    });
    mocks.transitionOrder.mockResolvedValue({
      id: "order",
      status: "CONFIRMED",
    });
  });

  it("runs strict FormData parsing before checkout authorization/service", async () => {
    const invalid = new FormData();
    invalid.set("idempotencyKey", "request_key_123456");
    invalid.set("productId", "product");
    invalid.set("quantity", "1e2");
    const result = await placeOrderAction({}, invalid);
    expect(result.error?.code).toBe("VALIDATION_FAILED");
    expect(mocks.requireRole).not.toHaveBeenCalled();
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("authorizes from the session boundary and forwards only parsed order fields", async () => {
    const valid = new FormData();
    valid.set("idempotencyKey", "request_key_123456");
    valid.set("productId", "product");
    valid.set("quantity", "2");
    valid.set("currency", "FAKE");
    valid.set("priceMinor", "1");
    await expect(placeOrderAction({}, valid)).resolves.toEqual({
      success: true,
    });
    expect(mocks.requireRole).toHaveBeenCalledWith(Role.CUSTOMER);
    expect(mocks.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: "customer" }),
      {
        idempotencyKey: "request_key_123456",
        items: [{ productId: "product", quantity: "2" }],
      },
    );
  });

  it("reauthorizes transition actions", async () => {
    const form = new FormData();
    form.set("orderId", "order");
    form.set("target", "CONFIRMED");
    await expect(transitionOrderAction(form)).rejects.toThrow(
      "REDIRECT:/orders/order?saved=1",
    );
    expect(mocks.requireAuthenticatedActor).toHaveBeenCalledOnce();
    expect(mocks.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: "supplier" }),
      "order",
      "CONFIRMED",
    );
  });
});
