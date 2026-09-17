import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { OrderStatus, Role } from "@/generated/prisma/enums";
import { ROLE_NAVIGATION } from "@/modules/auth/navigation";
import {
  ORDER_ACTION_LABEL,
  ORDER_STATUS_LABEL,
  orderStateMessage,
} from "@/modules/orders/presentation";
import { allowedTargets } from "@/modules/orders/service";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("functional UX contract", () => {
  it("keeps management navigation separated by role", () => {
    expect(ROLE_NAVIGATION[Role.ADMIN].map((link) => link.label)).toEqual([
      "Dashboard",
      "Categories",
      "Orders",
      "Public catalog",
    ]);
    expect(ROLE_NAVIGATION[Role.SUPPLIER].map((link) => link.label)).toEqual([
      "Overview",
      "Products",
      "Orders",
      "Public catalog",
    ]);
    expect(ROLE_NAVIGATION[Role.CUSTOMER].map((link) => link.label)).toEqual([
      "Account",
      "Products",
      "Cart",
      "Orders",
    ]);
  });

  it("maps every order status to a readable label", () => {
    expect(ORDER_STATUS_LABEL).toEqual({
      PENDING: "Pending",
      CONFIRMED: "Confirmed",
      SHIPPED: "Shipped",
      DELIVERED: "Delivered",
      CANCELLED: "Cancelled",
    });
  });

  it("uses explicit labels for every possible transition", () => {
    expect(ORDER_ACTION_LABEL).toMatchObject({
      CONFIRMED: "Confirm order",
      SHIPPED: "Mark as shipped",
      DELIVERED: "Mark as delivered",
      CANCELLED: "Cancel order",
    });
  });

  it("renders no mutation target for terminal statuses", () => {
    for (const role of Object.values(Role)) {
      expect(allowedTargets(role, OrderStatus.DELIVERED)).toEqual([]);
      expect(allowedTargets(role, OrderStatus.CANCELLED)).toEqual([]);
    }
    expect(orderStateMessage(Role.CUSTOMER, OrderStatus.DELIVERED)).toBe(
      "This order has been delivered.",
    );
    expect(orderStateMessage(Role.ADMIN, OrderStatus.CANCELLED)).toContain(
      "stock was restored",
    );
  });

  it("prevents customer access to fulfillment actions", () => {
    expect(allowedTargets(Role.CUSTOMER, OrderStatus.PENDING)).toEqual([
      OrderStatus.CANCELLED,
    ]);
    expect(allowedTargets(Role.CUSTOMER, OrderStatus.CONFIRMED)).toEqual([]);
    expect(allowedTargets(Role.CUSTOMER, OrderStatus.SHIPPED)).toEqual([]);
  });

  it("has deterministic return links on detail and edit pages", async () => {
    const paths = {
      "src/app/orders/[orderId]/page.tsx": 'href="/orders"',
      "src/app/supplier/products/new/page.tsx": 'href="/supplier/products"',
      "src/app/supplier/products/[id]/edit/page.tsx":
        'href="/supplier/products"',
      "src/app/admin/categories/page.tsx": 'href="/admin"',
      "src/app/products/[productId]/page.tsx": 'href="/products"',
    };
    await Promise.all(
      Object.entries(paths).map(async ([path, expected]) => {
        expect(await readFile(`${root}/${path}`, "utf8")).toContain(expected);
      }),
    );
  });

  it("contains no stale phase copy or critical router.back usage", async () => {
    const paths = [
      "src/app/page.tsx",
      "src/app/orders/[orderId]/page.tsx",
      "src/app/supplier/products/new/page.tsx",
      "src/app/supplier/products/[id]/edit/page.tsx",
    ];
    const source = (
      await Promise.all(
        paths.map((path) => readFile(`${root}/${path}`, "utf8")),
      )
    ).join("\n");
    expect(source).not.toMatch(/Foundation|deferred placeholder/i);
    expect(source).not.toContain("router.back(");
  });

  it("gives role-specific empty states a recovery destination", async () => {
    const orders = await readFile(`${root}/src/app/orders/page.tsx`, "utf8");
    const products = await readFile(
      `${root}/src/app/supplier/products/page.tsx`,
      "utf8",
    );
    expect(orders).toContain("You have not placed any orders yet.");
    expect(orders).toContain("Manage products");
    expect(products).toContain("No products yet.");
    expect(products).toContain("Add product");
  });
});
