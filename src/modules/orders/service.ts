import { Prisma } from "@/generated/prisma/client";
import { OrderStatus, Role, StockMovementType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  addMinorUnits,
  formatMinorUnits,
  multiplyMinorUnits,
} from "@/lib/money";
import {
  assertAuthenticatedActor,
  type Actor,
} from "@/modules/auth/authorization";
import {
  parseOrderSubmission,
  type ParsedOrderSubmission,
} from "@/modules/orders/input";

type Tx = Prisma.TransactionClient;
type LockedProduct = {
  id: string;
  supplierId: string;
  name: string;
  priceMinor: bigint;
  currency: string;
  stockQuantity: number;
  archivedAt: Date | null;
  categoryArchivedAt: Date | null;
  supplierDisabledAt: Date | null;
};

const orderItemSelect = {
  id: true,
  productId: true,
  productNameSnapshot: true,
  unitPriceMinor: true,
  quantity: true,
  lineTotalMinor: true,
} satisfies Prisma.OrderItemSelect;

const orderSelect = {
  id: true,
  checkoutGroupId: true,
  status: true,
  currency: true,
  subtotalMinor: true,
  totalMinor: true,
  createdAt: true,
  confirmedAt: true,
  shippedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  items: { select: orderItemSelect, orderBy: { id: "asc" as const } },
} satisfies Prisma.OrderSelect;

function dto(order: Prisma.OrderGetPayload<{ select: typeof orderSelect }>) {
  return {
    ...order,
    subtotalMinor: order.subtotalMinor.toString(),
    totalMinor: order.totalMinor.toString(),
    formattedTotal: formatMinorUnits(order.totalMinor, order.currency),
    items: order.items.map((item) => ({
      ...item,
      unitPriceMinor: item.unitPriceMinor.toString(),
      lineTotalMinor: item.lineTotalMinor.toString(),
      formattedUnitPrice: formatMinorUnits(item.unitPriceMinor, order.currency),
      formattedLineTotal: formatMinorUnits(item.lineTotalMinor, order.currency),
    })),
  };
}

async function reloadActor(tx: Tx, actor: Actor) {
  const rows = await tx.$queryRaw<
    Array<{ id: string; role: Role; disabledAt: Date | null }>
  >(Prisma.sql`
    SELECT "id", "role", "disabledAt" FROM "User" WHERE "id" = ${actor.id} FOR UPDATE
  `);
  const current = rows[0];
  if (!current)
    throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  if (current.disabledAt)
    throw new AppError("FORBIDDEN", "This account is disabled.");
  return current;
}

function sameRequest(
  existing: Array<{
    items: Array<{ productId: string | null; quantity: number }>;
  }>,
  input: ParsedOrderSubmission,
) {
  const saved = existing
    .flatMap((order) => order.items)
    .map((item) => `${item.productId}:${item.quantity}`)
    .sort();
  const requested = input.items
    .map((item) => `${item.productId}:${item.quantity}`)
    .sort();
  return (
    saved.length === requested.length &&
    saved.every((value, index) => value === requested[index])
  );
}

async function existingCheckout(
  tx: Tx,
  customerId: string,
  input: ParsedOrderSubmission,
) {
  const group = await tx.checkoutGroup.findUnique({
    where: {
      customerId_idempotencyKey: {
        customerId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: {
      orders: {
        include: { items: { select: { productId: true, quantity: true } } },
      },
    },
  });
  if (!group) return null;
  if (!sameRequest(group.orders, input)) {
    throw new AppError(
      "DUPLICATE_REQUEST",
      "That request key was already used for a different order.",
    );
  }
  return group.id;
}

export async function placeOrder(
  actor: Actor,
  raw: { idempotencyKey: unknown; items: unknown },
) {
  assertAuthenticatedActor(actor);
  const input = parseOrderSubmission(raw);
  return prisma.$transaction(async (tx) => {
    const customer = await reloadActor(tx, actor);
    if (customer.role !== Role.CUSTOMER) {
      throw new AppError("FORBIDDEN", "Only customers can place orders.");
    }
    const repeated = await existingCheckout(tx, customer.id, input);
    if (repeated) return { checkoutGroupId: repeated, repeated: true };

    const productIds = input.items.map((item) => item.productId).sort();
    const products = await tx.$queryRaw<LockedProduct[]>(Prisma.sql`
      SELECT p."id", p."supplierId", p."name", p."priceMinor", p."currency", p."stockQuantity",
             p."archivedAt", c."archivedAt" AS "categoryArchivedAt", s."disabledAt" AS "supplierDisabledAt"
      FROM "Product" p
      JOIN "Category" c ON c."id" = p."categoryId"
      JOIN "User" s ON s."id" = p."supplierId"
      WHERE p."id" IN (${Prisma.join(productIds)})
      ORDER BY p."id" FOR UPDATE OF p
    `);
    const byId = new Map(products.map((product) => [product.id, product]));
    for (const line of input.items) {
      const product = byId.get(line.productId);
      if (!product)
        throw new AppError("NOT_FOUND", "A requested product was not found.");
      if (
        product.archivedAt ||
        product.categoryArchivedAt ||
        product.supplierDisabledAt
      ) {
        throw new AppError(
          "VALIDATION_FAILED",
          "A requested product is unavailable.",
        );
      }
      if (product.stockQuantity < line.quantity) {
        throw new AppError(
          "INSUFFICIENT_STOCK",
          `${product.name} does not have enough stock.`,
        );
      }
    }

    const group = await tx.checkoutGroup.create({
      data: { customerId: customer.id, idempotencyKey: input.idempotencyKey },
    });
    const suppliers = new Map<string, typeof input.items>();
    for (const line of input.items) {
      const supplierId = byId.get(line.productId)!.supplierId;
      suppliers.set(supplierId, [...(suppliers.get(supplierId) ?? []), line]);
    }
    for (const [supplierId, lines] of [...suppliers].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const currencies = new Set(
        lines.map((line) => byId.get(line.productId)!.currency),
      );
      if (currencies.size !== 1)
        throw new AppError(
          "VALIDATION_FAILED",
          "Products with different currencies cannot share an order.",
        );
      const currency = currencies.values().next().value!;
      const subtotal = lines.reduce((sum, line) => {
        const lineTotal = multiplyMinorUnits(
          byId.get(line.productId)!.priceMinor,
          line.quantity,
        );
        return addMinorUnits(sum, lineTotal);
      }, 0n);
      const order = await tx.order.create({
        data: {
          checkoutGroupId: group.id,
          customerId: customer.id,
          supplierId,
          currency,
          subtotalMinor: subtotal,
          totalMinor: subtotal,
        },
      });
      for (const line of [...lines].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      )) {
        const product = byId.get(line.productId)!;
        const lineTotalMinor = multiplyMinorUnits(
          product.priceMinor,
          line.quantity,
        );
        const item = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: product.id,
            productNameSnapshot: product.name,
            unitPriceMinor: product.priceMinor,
            quantity: line.quantity,
            lineTotalMinor,
          },
        });
        const changed = await tx.product.updateMany({
          where: { id: product.id, stockQuantity: { gte: line.quantity } },
          data: { stockQuantity: { decrement: line.quantity } },
        });
        if (changed.count !== 1)
          throw new AppError(
            "INSUFFICIENT_STOCK",
            `${product.name} does not have enough stock.`,
          );
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            orderItemId: item.id,
            type: StockMovementType.ORDER_DECREMENT,
            quantityDelta: -line.quantity,
            actorUserId: customer.id,
            reason: "Customer checkout",
          },
        });
      }
    }
    return { checkoutGroupId: group.id, repeated: false };
  });
}

const forwardTransitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
};

function mayTransition(role: Role, from: OrderStatus, to: OrderStatus) {
  if (to === OrderStatus.CANCELLED) {
    return role === Role.CUSTOMER
      ? from === OrderStatus.PENDING
      : from === OrderStatus.PENDING || from === OrderStatus.CONFIRMED;
  }
  return (
    role !== Role.CUSTOMER && (forwardTransitions[from] ?? []).includes(to)
  );
}

export async function transitionOrder(
  actor: Actor,
  orderId: string,
  target: OrderStatus,
) {
  assertAuthenticatedActor(actor);
  if (!Object.values(OrderStatus).includes(target))
    throw new AppError("VALIDATION_FAILED", "Unknown order status.");
  return prisma.$transaction(async (tx) => {
    const current = await reloadActor(tx, actor);
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        customerId: string;
        supplierId: string;
        status: OrderStatus;
      }>
    >(Prisma.sql`
      SELECT "id", "customerId", "supplierId", "status" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
    `);
    const order = locked[0];
    const owns =
      order &&
      (current.role === Role.ADMIN ||
        (current.role === Role.CUSTOMER && order.customerId === current.id) ||
        (current.role === Role.SUPPLIER && order.supplierId === current.id));
    if (!owns) throw new AppError("NOT_FOUND", "Order not found.");
    if (!mayTransition(current.role, order.status, target)) {
      throw new AppError(
        "INVALID_STATUS_TRANSITION",
        `Order cannot move from ${order.status} to ${target}.`,
      );
    }
    if (target === OrderStatus.CANCELLED) {
      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { id: true, productId: true, quantity: true },
        orderBy: { productId: "asc" },
      });
      if (items.some((item) => !item.productId))
        throw new AppError(
          "CONFLICT",
          "Stock cannot be restored because a product reference is missing.",
        );
      const productIds = items.map((item) => item.productId!).sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR UPDATE`,
      );
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId! },
          data: { stockQuantity: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId!,
            orderItemId: item.id,
            type: StockMovementType.CANCELLATION_RESTORE,
            quantityDelta: item.quantity,
            actorUserId: current.id,
            reason: "Order cancellation",
          },
        });
      }
    }
    const timestamp = new Date();
    return tx.order.update({
      where: { id: order.id },
      data: {
        status: target,
        ...(target === OrderStatus.CONFIRMED ? { confirmedAt: timestamp } : {}),
        ...(target === OrderStatus.SHIPPED ? { shippedAt: timestamp } : {}),
        ...(target === OrderStatus.DELIVERED ? { deliveredAt: timestamp } : {}),
        ...(target === OrderStatus.CANCELLED ? { cancelledAt: timestamp } : {}),
      },
      select: { id: true, status: true },
    });
  });
}

async function currentReadActor(actor: Actor) {
  assertAuthenticatedActor(actor);
  const current = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!current) {
    throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  }
  if (current.disabledAt) {
    throw new AppError("FORBIDDEN", "This account is disabled.");
  }
  return current;
}

function orderScope(current: {
  id: string;
  role: Role;
}): Prisma.OrderWhereInput {
  if (current.role === Role.CUSTOMER) return { customerId: current.id };
  if (current.role === Role.SUPPLIER) return { supplierId: current.id };
  if (current.role === Role.ADMIN) return {};
  throw new AppError(
    "FORBIDDEN",
    "You do not have permission to access orders.",
  );
}

export async function listOrders(actor: Actor) {
  const current = await currentReadActor(actor);
  const rows = await prisma.order.findMany({
    where: orderScope(current),
    select: orderSelect,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(dto);
}

export async function getOrder(actor: Actor, id: string) {
  const current = await currentReadActor(actor);
  const row = await prisma.order.findFirst({
    where: { id, ...orderScope(current) },
    select: orderSelect,
  });
  if (!row) throw new AppError("NOT_FOUND", "Order not found.");
  return dto(row);
}

export function allowedTargets(role: Role, status: OrderStatus) {
  return Object.values(OrderStatus).filter((target) =>
    mayTransition(role, status, target),
  );
}
