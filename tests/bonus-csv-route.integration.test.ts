import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({}) }));
vi.mock("@/modules/auth/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

import { GET } from "@/app/orders/export/route";
import type { Actor } from "@/modules/auth/authorization";
import { listAdminOrderExportRows } from "@/modules/orders/service";

const run = `bonus-csv-${randomUUID()}`;
const ids = {
  admin: `${run}-admin`,
  customer: `${run}-customer`,
  supplier: `${run}-supplier`,
  disabledAdmin: `${run}-disabled-admin`,
  demotedAdmin: `${run}-demoted-admin`,
  checkout: `${run}-checkout`,
  firstOrder: `-${run}-formula-order`,
  secondOrder: `${run}-second-order`,
};
const userIds = [
  ids.admin,
  ids.customer,
  ids.supplier,
  ids.disabledAdmin,
  ids.demotedAdmin,
];
const orderIds = [ids.firstOrder, ids.secondOrder];

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
  await prisma.checkoutGroup.deleteMany({ where: { id: ids.checkout } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ids.admin,
        name: "CSV Admin",
        email: `${ids.admin}@example.test`,
        role: Role.ADMIN,
      },
      {
        id: ids.customer,
        name: ' \t=SUM(1,1),\r\n"Customer"',
        email: "+customer@example.test",
        role: Role.CUSTOMER,
      },
      {
        id: ids.supplier,
        name: '@Supplier, "Quoted"\rLine\nNext',
        email: `${ids.supplier}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.disabledAdmin,
        name: "Disabled Admin",
        email: `${ids.disabledAdmin}@example.test`,
        role: Role.ADMIN,
        disabledAt: new Date(),
      },
      {
        id: ids.demotedAdmin,
        name: "Demoted Admin",
        email: `${ids.demotedAdmin}@example.test`,
        role: Role.CUSTOMER,
      },
    ],
  });
  await prisma.checkoutGroup.create({
    data: {
      id: ids.checkout,
      customerId: ids.customer,
      idempotencyKey: `${run}-secret-fingerprint`,
    },
  });
  await prisma.order.createMany({
    data: [
      {
        id: ids.firstOrder,
        checkoutGroupId: ids.checkout,
        customerId: ids.customer,
        supplierId: ids.supplier,
        currency: "AED",
        subtotalMinor: 9_007_199_254_740_993n,
        totalMinor: 9_007_199_254_740_993n,
        createdAt: new Date("2026-06-03T10:00:00.000Z"),
      },
      {
        id: ids.secondOrder,
        checkoutGroupId: ids.checkout,
        customerId: ids.customer,
        supplierId: ids.supplier,
        currency: "USD",
        subtotalMinor: 123n,
        totalMinor: 123n,
        createdAt: new Date("2026-06-03T11:00:00.000Z"),
      },
    ],
  });
});

beforeEach(() => vi.clearAllMocks());
afterAll(cleanup);

function session(id: string | null) {
  mocks.getSession.mockResolvedValue(id ? { user: { id } } : null);
}

describe("real admin order CSV service and route", () => {
  it.each([
    ["anonymous", null, 401],
    ["customer", ids.customer, 403],
    ["supplier", ids.supplier, 403],
    ["disabled admin", ids.disabledAdmin, 403],
    ["database-demoted admin", ids.demotedAdmin, 403],
  ])("denies %s export requests", async (_label, userId, status) => {
    session(userId);
    const response = await GET();
    expect(response.status).toBe(status);
  });

  it("exports persisted exact totals and currencies in deterministic order", async () => {
    const rows = await listAdminOrderExportRows(actor(ids.admin, Role.ADMIN));
    const owned = rows.filter((row) => orderIds.includes(row.orderId));
    expect(owned.map((row) => row.orderId)).toEqual(orderIds);
    expect(owned[0]).toMatchObject({
      currency: "AED",
      totalMinor: "9007199254740993",
      humanReadableTotal: "AED 90071992547409.93",
    });
    expect(owned[1]).toMatchObject({
      currency: "USD",
      totalMinor: "123",
      humanReadableTotal: "USD 1.23",
    });
  });

  it("returns the exact headers and safe RFC-compatible CSV body", async () => {
    session(ids.admin);
    const response = await GET();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const csv = new TextDecoder().decode(bytes.slice(3));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="orders.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")[0]).toBe(
      '"Order ID","Created at","Updated at","Customer name","Customer email","Supplier name","Status","Currency","Total minor units","Human-readable total"',
    );
    expect(csv.indexOf(ids.firstOrder)).toBeLessThan(
      csv.indexOf(ids.secondOrder),
    );
    expect(csv).toContain("9007199254740993");
    expect(csv).toContain('"\' \t=SUM(1,1),\r\n""Customer"""');
    expect(csv).toContain('"\'+customer@example.test"');
    expect(csv).toContain('"\'@Supplier, ""Quoted""\rLine\nNext"');
    expect(csv).toContain(`"'${ids.firstOrder}"`);
    expect(csv).not.toContain(ids.checkout);
    expect(csv).not.toContain(`${run}-secret-fingerprint`);
    for (const forbidden of [
      "checkoutGroupId",
      "idempotencyKey",
      "password",
      "session",
      "storageKey",
    ]) {
      expect(csv).not.toContain(forbidden);
    }
  });
});
