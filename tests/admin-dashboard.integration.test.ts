import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OrderStatus, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { Actor } from "@/modules/auth/authorization";
import {
  getAdminDashboard,
  LOW_STOCK_THRESHOLD,
  ORDER_ACTIVITY_DAYS,
} from "@/modules/admin/dashboard";

const run = `dashboard-test-${randomUUID()}`;
const id = (suffix: string) => `${run}-${suffix}`;
const ids = {
  admin: id("admin"),
  customer: id("customer"),
  supplierA: id("supplier-a"),
  supplierB: id("supplier-b"),
  disabledSupplier: id("supplier-disabled"),
  activeCategory: id("category-active"),
  archivedCategory: id("category-archived"),
  zero: id("product-zero"),
  lowA: id("product-low-a"),
  lowB: id("product-low-b"),
  threshold: id("product-threshold"),
  high: id("product-high"),
  archivedProduct: id("product-archived"),
  archivedCategoryProduct: id("product-archived-category"),
  disabledSupplierProduct: id("product-disabled-supplier"),
};
const productIds = [
  ids.zero,
  ids.lowA,
  ids.lowB,
  ids.threshold,
  ids.high,
  ids.archivedProduct,
  ids.archivedCategoryProduct,
  ids.disabledSupplierProduct,
];
const RANGE_START = new Date("2041-03-07T00:00:00.000Z");
const RANGE_END = new Date("2041-03-14T00:00:00.000Z");
const NOW = new Date("2041-03-13T12:00:00.000Z");

type OrderFixture = {
  suffix: string;
  supplierId: string;
  currency: string;
  totalMinor: bigint;
  status: OrderStatus;
  createdAt: string;
  group?: string;
};
const orderFixtures: OrderFixture[] = [
  {
    suffix: "lower-bound-pending",
    supplierId: ids.supplierA,
    currency: "AED",
    totalMinor: 10n,
    status: OrderStatus.PENDING,
    createdAt: "2041-03-07T00:00:00.000Z",
  },
  {
    suffix: "before-lower",
    supplierId: ids.supplierA,
    currency: "AED",
    totalMinor: 10n,
    status: OrderStatus.PENDING,
    createdAt: "2041-03-06T23:59:59.999Z",
  },
  {
    suffix: "confirmed",
    supplierId: ids.supplierA,
    currency: "AED",
    totalMinor: 20n,
    status: OrderStatus.CONFIRMED,
    createdAt: "2041-03-08T12:00:00.000Z",
  },
  {
    suffix: "shipped",
    supplierId: ids.supplierA,
    currency: "AED",
    totalMinor: 30n,
    status: OrderStatus.SHIPPED,
    createdAt: "2041-03-09T12:00:00.000Z",
  },
  {
    suffix: "before-midnight-delivered",
    supplierId: ids.supplierA,
    currency: "AED",
    totalMinor: 9_007_199_254_740_993n,
    status: OrderStatus.DELIVERED,
    createdAt: "2041-03-10T23:59:59.999Z",
  },
  {
    suffix: "at-midnight-delivered",
    supplierId: ids.supplierA,
    currency: "AED",
    totalMinor: 100n,
    status: OrderStatus.DELIVERED,
    createdAt: "2041-03-11T00:00:00.000Z",
  },
  {
    suffix: "mixed-a",
    supplierId: ids.supplierA,
    currency: "USD",
    totalMinor: 250n,
    status: OrderStatus.DELIVERED,
    createdAt: "2041-03-12T08:00:00.000Z",
    group: "mixed",
  },
  {
    suffix: "mixed-b",
    supplierId: ids.supplierB,
    currency: "AED",
    totalMinor: 500n,
    status: OrderStatus.DELIVERED,
    createdAt: "2041-03-12T08:00:00.000Z",
    group: "mixed",
  },
  {
    suffix: "cancelled",
    supplierId: ids.supplierA,
    currency: "AED",
    totalMinor: 999n,
    status: OrderStatus.CANCELLED,
    createdAt: "2041-03-13T07:00:00.000Z",
  },
  {
    suffix: "disabled-delivered",
    supplierId: ids.disabledSupplier,
    currency: "AED",
    totalMinor: 700n,
    status: OrderStatus.DELIVERED,
    createdAt: "2041-03-13T08:00:00.000Z",
  },
  {
    suffix: "upper-bound",
    supplierId: ids.supplierA,
    currency: "AED",
    totalMinor: 10n,
    status: OrderStatus.PENDING,
    createdAt: "2041-03-14T00:00:00.000Z",
  },
  {
    suffix: "outside",
    supplierId: ids.supplierA,
    currency: "AED",
    totalMinor: 10n,
    status: OrderStatus.PENDING,
    createdAt: "2041-03-20T00:00:00.000Z",
  },
  ...[
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED,
  ].map((status) => ({
    suffix: `disabled-${status.toLowerCase()}`,
    supplierId: ids.disabledSupplier,
    currency: "AED",
    totalMinor: 999n,
    status,
    createdAt: "2041-02-01T00:00:00.000Z",
  })),
];
const orderIds = orderFixtures.map(({ suffix }) => id(`order-${suffix}`));
const groupNames = [
  ...new Set(orderFixtures.map(({ group, suffix }) => group ?? suffix)),
];
const groupIds = groupNames.map((name) => id(`group-${name}`));
const groupId = (fixture: OrderFixture) =>
  id(`group-${fixture.group ?? fixture.suffix}`);
const actor = (actorId: string, role: Role): Actor => ({
  id: actorId,
  role,
  disabledAt: null,
  name: actorId,
  email: `${actorId}@example.test`,
});
const admin = actor(ids.admin, Role.ADMIN);

beforeAll(async () => {
  const unrelated = await prisma.order.count({
    where: { createdAt: { gte: RANGE_START, lt: RANGE_END } },
  });
  expect(
    unrelated,
    "The isolated dashboard window must be empty before fixtures are inserted",
  ).toBe(0);
  await prisma.user.createMany({
    data: [
      {
        id: ids.admin,
        name: "Dashboard Admin",
        email: `${ids.admin}@example.test`,
        role: Role.ADMIN,
      },
      {
        id: ids.customer,
        name: "Dashboard Customer",
        email: `${ids.customer}@example.test`,
        role: Role.CUSTOMER,
      },
      {
        id: ids.supplierA,
        name: "Alpha Supplier",
        email: `${ids.supplierA}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.supplierB,
        name: "Beta Supplier",
        email: `${ids.supplierB}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.disabledSupplier,
        name: "Disabled Supplier",
        email: `${ids.disabledSupplier}@example.test`,
        role: Role.SUPPLIER,
        disabledAt: new Date(),
      },
    ],
  });
  await prisma.category.createMany({
    data: [
      {
        id: ids.activeCategory,
        name: "Active Dashboard Category",
        slug: id("active"),
      },
      {
        id: ids.archivedCategory,
        name: "Archived Dashboard Category",
        slug: id("archived"),
        archivedAt: new Date(),
      },
    ],
  });
  const product = (
    productId: string,
    supplierId: string,
    categoryId: string,
    stockQuantity: number,
    archivedAt: Date | null = null,
  ) => ({
    id: productId,
    supplierId,
    categoryId,
    name: productId,
    description: "Dashboard test product",
    priceMinor: 777n,
    currency: "AED",
    stockQuantity,
    imageUrl: "https://example.test/dashboard.png",
    imageStorageKey: "external:test",
    archivedAt,
  });
  await prisma.product.createMany({
    data: [
      product(ids.zero, ids.supplierA, ids.activeCategory, 0),
      product(ids.lowA, ids.supplierA, ids.activeCategory, 2),
      product(ids.lowB, ids.supplierA, ids.activeCategory, 2),
      product(
        ids.threshold,
        ids.supplierA,
        ids.activeCategory,
        LOW_STOCK_THRESHOLD,
      ),
      product(ids.high, ids.supplierA, ids.activeCategory, 11),
      product(
        ids.archivedProduct,
        ids.supplierA,
        ids.activeCategory,
        1,
        new Date(),
      ),
      product(
        ids.archivedCategoryProduct,
        ids.supplierA,
        ids.archivedCategory,
        1,
      ),
      product(
        ids.disabledSupplierProduct,
        ids.disabledSupplier,
        ids.activeCategory,
        1,
      ),
    ],
  });
  await prisma.checkoutGroup.createMany({
    data: groupNames.map((name) => ({
      id: id(`group-${name}`),
      customerId: ids.customer,
      idempotencyKey: id(`key-${name}`),
    })),
  });
  await prisma.order.createMany({
    data: orderFixtures.map((fixture) => ({
      id: id(`order-${fixture.suffix}`),
      checkoutGroupId: groupId(fixture),
      customerId: ids.customer,
      supplierId: fixture.supplierId,
      status: fixture.status,
      currency: fixture.currency,
      subtotalMinor: fixture.totalMinor,
      totalMinor: fixture.totalMinor,
      createdAt: new Date(fixture.createdAt),
    })),
  });
});

afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.checkoutGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.deleteMany({
    where: { id: { in: [ids.activeCategory, ids.archivedCategory] } },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          ids.admin,
          ids.customer,
          ids.supplierA,
          ids.supplierB,
          ids.disabledSupplier,
        ],
      },
    },
  });
});

describe("admin dashboard PostgreSQL aggregates", () => {
  it("reloads authorization and returns exact typed denial codes", async () => {
    await expect(getAdminDashboard(null)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(
      getAdminDashboard(actor(ids.customer, Role.CUSTOMER)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      getAdminDashboard(actor(ids.supplierA, Role.SUPPLIER)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.user.update({
      where: { id: ids.admin },
      data: { disabledAt: new Date() },
    });
    await expect(getAdminDashboard(admin)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await prisma.user.update({
      where: { id: ids.admin },
      data: { disabledAt: null, role: Role.CUSTOMER },
    });
    await expect(getAdminDashboard(admin)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await prisma.user.update({
      where: { id: ids.admin },
      data: { role: Role.ADMIN },
    });
  });

  it("covers the complete low-stock boundary, exclusions, ordering, and recursive DTO allow-list", async () => {
    const result = await getAdminDashboard(admin, NOW);
    const rows = result.lowStockProducts.filter((row) =>
      productIds.includes(row.id),
    );
    expect(rows.map((row) => row.id)).toEqual([
      ids.zero,
      ids.lowA,
      ids.lowB,
      ids.threshold,
    ]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "category",
        "currency",
        "id",
        "name",
        "priceMinor",
        "stockQuantity",
        "supplier",
      ]);
      expect(Object.keys(row.supplier).sort()).toEqual(["id", "name"]);
      expect(Object.keys(row.category).sort()).toEqual(["id", "name"]);
    }
    expect(rows.map((row) => row.stockQuantity)).toEqual([0, 2, 2, 10]);
  });

  it("uses exact UTC half-open boundaries and counts every non-cancelled supplier order", async () => {
    const result = await getAdminDashboard(admin, NOW);
    expect(result.ordersPerDay).toEqual([
      { date: "2041-03-07", orderCount: 1 },
      { date: "2041-03-08", orderCount: 1 },
      { date: "2041-03-09", orderCount: 1 },
      { date: "2041-03-10", orderCount: 1 },
      { date: "2041-03-11", orderCount: 1 },
      { date: "2041-03-12", orderCount: 2 },
      { date: "2041-03-13", orderCount: 1 },
    ]);
    expect(result.ordersPerDay).toHaveLength(ORDER_ACTIVITY_DAYS);
    expect(new Set(result.ordersPerDay.map(({ date }) => date)).size).toBe(7);
    for (const row of result.ordersPerDay)
      expect(Object.keys(row).sort()).toEqual(["date", "orderCount"]);
  });

  it("is identical in UTC and America/New_York across the 2041 DST transition", async () => {
    const expected = [
      { date: "2041-03-07", orderCount: 1 },
      { date: "2041-03-08", orderCount: 1 },
      { date: "2041-03-09", orderCount: 1 },
      { date: "2041-03-10", orderCount: 1 },
      { date: "2041-03-11", orderCount: 1 },
      { date: "2041-03-12", orderCount: 2 },
      { date: "2041-03-13", orderCount: 1 },
    ];
    const utc = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      const [{ timezone }] = await tx.$queryRaw<
        Array<{ timezone: string }>
      >`SELECT current_setting('TimeZone') AS timezone`;
      expect(timezone).toBe("UTC");
      return (await getAdminDashboard(admin, NOW, tx)).ordersPerDay;
    });
    const nonUtc = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'America/New_York'`;
      const [{ timezone }] = await tx.$queryRaw<
        Array<{ timezone: string }>
      >`SELECT current_setting('TimeZone') AS timezone`;
      expect(timezone).toBe("America/New_York");
      return (await getAdminDashboard(admin, NOW, tx)).ordersPerDay;
    });

    expect(utc).toEqual(expected);
    expect(nonUtc).toEqual(expected);
    expect(utc).toHaveLength(ORDER_ACTIVITY_DAYS);
    expect(nonUtc).toHaveLength(ORDER_ACTIVITY_DAYS);
    expect(new Set(utc.map(({ date }) => date)).size).toBe(7);
    expect(new Set(nonUtc.map(({ date }) => date)).size).toBe(7);
    expect(nonUtc).toEqual(utc);
  });

  it("keeps historical delivered revenue for disabled suppliers and excludes every other status", async () => {
    await prisma.product.update({
      where: { id: ids.lowA },
      data: { priceMinor: 1n },
    });
    const result = await getAdminDashboard(admin, NOW);
    const rows = result.revenuePerSupplier.filter((row) =>
      [ids.supplierA, ids.supplierB, ids.disabledSupplier].includes(
        row.supplier.id,
      ),
    );
    expect(rows).toEqual([
      {
        supplier: { id: ids.supplierA, name: "Alpha Supplier" },
        currency: "AED",
        revenueMinor: "9007199254741093",
      },
      {
        supplier: { id: ids.supplierA, name: "Alpha Supplier" },
        currency: "USD",
        revenueMinor: "250",
      },
      {
        supplier: { id: ids.supplierB, name: "Beta Supplier" },
        currency: "AED",
        revenueMinor: "500",
      },
      {
        supplier: { id: ids.disabledSupplier, name: "Disabled Supplier" },
        currency: "AED",
        revenueMinor: "700",
      },
    ]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "currency",
        "revenueMinor",
        "supplier",
      ]);
      expect(Object.keys(row.supplier).sort()).toEqual(["id", "name"]);
    }
  });

  it("returns a recursively allow-listed, JSON-safe dashboard DTO", async () => {
    const result = await getAdminDashboard(admin, NOW);
    expect(Object.keys(result).sort()).toEqual([
      "activityDays",
      "lowStockProducts",
      "lowStockThreshold",
      "ordersPerDay",
      "revenuePerSupplier",
      "timezone",
    ]);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "email",
      "password",
      "session",
      "idempotencyKey",
      "fingerprint",
      "disabledAt",
    ])
      expect(serialized).not.toContain(forbidden);
    expect(JSON.parse(serialized)).toEqual(result);
  });
});
