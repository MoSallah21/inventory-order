import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { Actor } from "@/modules/auth/authorization";
import { listOrdersPage } from "@/modules/orders/service";

const run = `bonus-orders-${randomUUID()}`;
const ids = {
  customerA: `${run}-customer-a`,
  customerB: `${run}-customer-b`,
  supplierA: `${run}-supplier-a`,
  supplierB: `${run}-supplier-b`,
  admin: `${run}-admin`,
  disabled: `${run}-disabled`,
  demoted: `${run}-demoted`,
  checkoutA: `${run}-checkout-a`,
  checkoutB: `${run}-checkout-b`,
};
const orderIdsA = Array.from(
  { length: 11 },
  (_, index) => `${run}-a-${String(index).padStart(2, "0")}`,
);
const orderIdsB = Array.from(
  { length: 10 },
  (_, index) => `${run}-b-${String(index).padStart(2, "0")}`,
);
const orderIds = [...orderIdsA, ...orderIdsB];
const userIds = [
  ids.customerA,
  ids.customerB,
  ids.supplierA,
  ids.supplierB,
  ids.admin,
  ids.disabled,
  ids.demoted,
];
const createdAt = new Date("2026-06-02T12:00:00.000Z");

const actor = (id: string, role: Role): Actor => ({
  id,
  role,
  name: id,
  email: `${id}@example.test`,
  disabledAt: null,
});

async function cleanup() {
  await prisma.stockMovement.deleteMany({
    where: { orderItem: { orderId: { in: orderIds } } },
  });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.checkoutGroup.deleteMany({
    where: { id: { in: [ids.checkoutA, ids.checkoutB] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ids.customerA,
        name: ids.customerA,
        email: `${ids.customerA}@example.test`,
        role: Role.CUSTOMER,
      },
      {
        id: ids.customerB,
        name: ids.customerB,
        email: `${ids.customerB}@example.test`,
        role: Role.CUSTOMER,
      },
      {
        id: ids.supplierA,
        name: ids.supplierA,
        email: `${ids.supplierA}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.supplierB,
        name: ids.supplierB,
        email: `${ids.supplierB}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.admin,
        name: ids.admin,
        email: `${ids.admin}@example.test`,
        role: Role.ADMIN,
      },
      {
        id: ids.demoted,
        name: ids.demoted,
        email: `${ids.demoted}@example.test`,
        role: Role.CUSTOMER,
      },
      {
        id: ids.disabled,
        name: ids.disabled,
        email: `${ids.disabled}@example.test`,
        role: Role.ADMIN,
        disabledAt: new Date(),
      },
    ],
  });
  await prisma.checkoutGroup.createMany({
    data: [
      {
        id: ids.checkoutA,
        customerId: ids.customerA,
        idempotencyKey: `${run}-key-a`,
      },
      {
        id: ids.checkoutB,
        customerId: ids.customerB,
        idempotencyKey: `${run}-key-b`,
      },
    ],
  });
  await prisma.order.createMany({
    data: [
      ...orderIdsA.map((id) => ({
        id,
        checkoutGroupId: ids.checkoutA,
        customerId: ids.customerA,
        supplierId: ids.supplierA,
        currency: "AED",
        subtotalMinor: 100n,
        totalMinor: 100n,
        createdAt,
      })),
      ...orderIdsB.map((id) => ({
        id,
        checkoutGroupId: ids.checkoutB,
        customerId: ids.customerB,
        supplierId: ids.supplierB,
        currency: "AED",
        subtotalMinor: 200n,
        totalMinor: 200n,
        createdAt,
      })),
    ],
  });
});

afterAll(cleanup);

describe("bonus order pagination production query", () => {
  it("isolates customer and supplier scopes from second actors", async () => {
    const customerA = await listOrdersPage(
      actor(ids.customerA, Role.CUSTOMER),
      1,
    );
    const customerB = await listOrdersPage(
      actor(ids.customerB, Role.CUSTOMER),
      1,
    );
    const supplierA = await listOrdersPage(
      actor(ids.supplierA, Role.SUPPLIER),
      1,
    );
    const supplierB = await listOrdersPage(
      actor(ids.supplierB, Role.SUPPLIER),
      1,
    );
    expect(customerA).toMatchObject({ totalCount: 11, pageCount: 2 });
    expect(supplierA).toMatchObject({ totalCount: 11, pageCount: 2 });
    expect(customerB).toMatchObject({ totalCount: 10, pageCount: 1 });
    expect(supplierB).toMatchObject({ totalCount: 10, pageCount: 1 });
    expect(
      customerA.orders.every((order) => order.customer.id === ids.customerA),
    ).toBe(true);
    expect(
      supplierA.orders.every((order) => order.supplier.id === ids.supplierA),
    ).toBe(true);
    expect(customerB.orders.map((order) => order.id)).not.toEqual(
      expect.arrayContaining(orderIdsA),
    );
    expect(supplierB.orders.map((order) => order.id)).not.toEqual(
      expect.arrayContaining(orderIdsA),
    );
  });

  it("returns every test-owned order to an active administrator", async () => {
    const result = await listOrdersPage(actor(ids.admin, Role.ADMIN), 1);
    const allPages = [];
    for (let page = 1; page <= result.pageCount; page += 1) {
      const current = await listOrdersPage(actor(ids.admin, Role.ADMIN), page);
      allPages.push(...current.orders.map((order) => order.id));
    }
    expect(allPages).toEqual(expect.arrayContaining(orderIds));
  });

  it("rejects disabled actors and rescoping defeats a stale admin role", async () => {
    await expect(
      listOrdersPage(actor(ids.disabled, Role.ADMIN), 1),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const demoted = await listOrdersPage(actor(ids.demoted, Role.ADMIN), 1);
    expect(demoted).toMatchObject({ totalCount: 0, page: 1, pageCount: 1 });
    expect(demoted.orders).toEqual([]);
  });

  it("paginates 10 and 11 scoped rows without gaps using the stable tie-breaker", async () => {
    const ten = await listOrdersPage(actor(ids.customerB, Role.CUSTOMER), 1);
    expect(ten).toMatchObject({ totalCount: 10, page: 1, pageCount: 1 });

    const first = await listOrdersPage(actor(ids.customerA, Role.CUSTOMER), 1);
    const second = await listOrdersPage(actor(ids.customerA, Role.CUSTOMER), 2);
    const expected = [...orderIdsA].sort().reverse();
    const actual = [
      ...first.orders.map((order) => order.id),
      ...second.orders.map((order) => order.id),
    ];
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(11);

    const clamped = await listOrdersPage(
      actor(ids.customerA, Role.CUSTOMER),
      999,
    );
    expect(clamped.page).toBe(2);
    expect(clamped.orders.map((order) => order.id)).toEqual([expected[10]]);
  });
});
