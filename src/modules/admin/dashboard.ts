import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  assertActorRole,
  assertAuthenticatedActor,
  type Actor,
} from "@/modules/auth/authorization";

export const LOW_STOCK_THRESHOLD = 10;
export const ORDER_ACTIVITY_DAYS = 7;

export type LowStockProductDto = {
  id: string;
  name: string;
  stockQuantity: number;
  supplier: { id: string; name: string };
  category: { id: string; name: string };
  currency: string;
  priceMinor: string;
};
export type OrdersPerDayDto = { date: string; orderCount: number };
export type SupplierRevenueDto = {
  supplier: { id: string; name: string };
  currency: string;
  revenueMinor: string;
};
export type AdminDashboardDto = {
  lowStockThreshold: number;
  activityDays: number;
  timezone: "UTC";
  lowStockProducts: LowStockProductDto[];
  ordersPerDay: OrdersPerDayDto[];
  revenuePerSupplier: SupplierRevenueDto[];
};

type DashboardClient = Pick<typeof prisma, "user" | "product" | "$queryRaw">;
type DailyOrderRow = { date: string; orderCount: bigint };
type RevenueRow = {
  supplierId: string;
  supplierName: string;
  currency: string;
  revenueMinor: string;
};

async function reloadAdmin(
  client: DashboardClient,
  actor: Actor | null,
): Promise<Actor> {
  const claimedActor = assertAuthenticatedActor(actor);
  const databaseActor = await client.user.findUnique({
    where: { id: claimedActor.id },
    select: { id: true, name: true, email: true, role: true, disabledAt: true },
  });
  return assertActorRole(assertAuthenticatedActor(databaseActor), [Role.ADMIN]);
}

function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function getAdminDashboard(
  actor: Actor | null,
  now = new Date(),
  client: DashboardClient = prisma,
): Promise<AdminDashboardDto> {
  await reloadAdmin(client, actor);
  const todayUtc = utcDateKey(now);

  const [products, dailyRows, revenueRows] = await Promise.all([
    client.product.findMany({
      where: {
        archivedAt: null,
        stockQuantity: { lte: LOW_STOCK_THRESHOLD },
        category: { archivedAt: null },
        supplier: { disabledAt: null },
      },
      orderBy: [{ stockQuantity: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        stockQuantity: true,
        currency: true,
        priceMinor: true,
        supplier: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    }),
    client.$queryRaw<DailyOrderRow[]>(Prisma.sql`
      WITH days AS (
        SELECT (${todayUtc}::date - (6 - offsets.value))::date AS day
        FROM generate_series(0, 6) AS offsets(value)
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS "date",
        COUNT(orders.id)::bigint AS "orderCount"
      FROM days
      LEFT JOIN "Order" AS orders
        ON (orders."createdAt" AT TIME ZONE 'UTC') >= (days.day::timestamp AT TIME ZONE 'UTC')
       AND (orders."createdAt" AT TIME ZONE 'UTC') < ((days.day + 1)::timestamp AT TIME ZONE 'UTC')
       AND orders.status <> 'CANCELLED'::"OrderStatus"
      GROUP BY days.day
      ORDER BY days.day ASC
    `),
    client.$queryRaw<RevenueRow[]>(Prisma.sql`
      SELECT orders."supplierId" AS "supplierId", suppliers.name AS "supplierName", orders.currency, SUM(orders."totalMinor")::text AS "revenueMinor"
      FROM "Order" AS orders INNER JOIN "User" AS suppliers ON suppliers.id = orders."supplierId"
      WHERE orders.status = 'DELIVERED'::"OrderStatus"
      GROUP BY orders."supplierId", suppliers.name, orders.currency
      ORDER BY suppliers.name ASC, orders."supplierId" ASC, orders.currency ASC
    `),
  ]);

  return {
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    activityDays: ORDER_ACTIVITY_DAYS,
    timezone: "UTC",
    lowStockProducts: products.map((product) => ({
      ...product,
      priceMinor: product.priceMinor.toString(),
    })),
    ordersPerDay: dailyRows.map((row) => ({
      date: row.date,
      orderCount: Number(row.orderCount),
    })),
    revenuePerSupplier: revenueRows.map((row) => ({
      supplier: { id: row.supplierId, name: row.supplierName },
      currency: row.currency,
      revenueMinor: row.revenueMinor,
    })),
  };
}
