import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { OrderStatus, Role, StockMovementType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { POSTGRES_BIGINT_MAX } from "@/lib/money";
import { serializeError } from "@/lib/errors";
import type { Actor } from "@/modules/auth/authorization";
import {
  getOrder,
  listOrders,
  placeOrder,
  transitionOrder,
} from "@/modules/orders/service";

const run = `order-test-${randomUUID()}`;
const ids = {
  customerA: `${run}-customer-a`,
  customerB: `${run}-customer-b`,
  disabled: `${run}-disabled`,
  supplierA: `${run}-supplier-a`,
  supplierB: `${run}-supplier-b`,
  admin: `${run}-admin`,
  category: `${run}-category`,
  archivedCategory: `${run}-archived-category`,
  productA: `${run}-product-a`,
  productB: `${run}-product-b`,
  archivedProduct: `${run}-archived-product`,
  inactiveProduct: `${run}-inactive-product`,
  disabledProduct: `${run}-disabled-product`,
  raceProduct: `${run}-race-product`,
  overflowLine: `${run}-overflow-line`,
  overflowA: `${run}-overflow-a`,
  overflowB: `${run}-overflow-b`,
};

const actor = (
  id: string,
  role: Role,
  disabledAt: Date | null = null,
): Actor => ({ id, role, disabledAt, name: id, email: `${id}@example.test` });
const customerA = actor(ids.customerA, Role.CUSTOMER);
const customerB = actor(ids.customerB, Role.CUSTOMER);
const supplierA = actor(ids.supplierA, Role.SUPPLIER);
const supplierB = actor(ids.supplierB, Role.SUPPLIER);
const admin = actor(ids.admin, Role.ADMIN);
let sequence = 0;
const key = () => `request_${run}_${sequence++}`.replaceAll("-", "_");
const request = (
  idempotencyKey: string,
  items: ReadonlyArray<readonly [string, string]>,
) => ({
  idempotencyKey,
  items: items.map(([productId, quantity]) => ({ productId, quantity })),
});

async function waitForBlockedBy(
  blockerPid: number,
  expectedFragments: readonly string[],
) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<
      Array<{ pid: number; blockers: number[]; query: string }>
    >`
      SELECT pid, pg_blocking_pids(pid) AS blockers, query
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    const matches = rows.filter((row) => row.blockers.includes(blockerPid));
    if (matches.length > 1) {
      throw new Error(
        `Expected one backend blocked by PID ${blockerPid}, found ${matches.map((row) => `${row.pid}:${row.query.slice(0, 120)}`).join(" | ")}.`,
      );
    }
    const candidate = matches[0];
    if (candidate) {
      if (
        !expectedFragments.every((fragment) =>
          candidate.query.includes(fragment),
        )
      ) {
        throw new Error(
          `Backend ${candidate.pid} blocked by PID ${blockerPid} was in the wrong statement phase: ${candidate.query.slice(0, 200)}`,
        );
      }
      return candidate;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `Timed out waiting for ${expectedFragments.join(" + ")} blocked by exact PostgreSQL PID ${blockerPid}.`,
  );
}

type Tracked<T> = {
  name: string;
  promise: Promise<T>;
  settlement: Promise<PromiseSettledResult<T>>;
  settled: boolean;
};

function track<T>(name: string, promise: Promise<T>): Tracked<T> {
  const operation: Tracked<T> = {
    name,
    promise,
    settled: false,
    settlement: Promise.resolve({ status: "fulfilled", value: undefined as T }),
  };
  operation.settlement = promise
    .then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    )
    .finally(() => {
      operation.settled = true;
    });
  return operation;
}

async function bounded<T>(
  name: string | (() => string),
  promise: Promise<T>,
  timeoutMs = 3_000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Timed out waiting for ${typeof name === "function" ? name() : name}.`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function settleTracked(operations: Array<Tracked<unknown> | undefined>) {
  const pending = operations.filter(
    (operation): operation is Tracked<unknown> => Boolean(operation),
  );
  await bounded(
    () =>
      `operations to settle: ${pending
        .filter((operation) => !operation.settled)
        .map((operation) => operation.name)
        .join(", ")}`,
    Promise.all(pending.map((operation) => operation.settlement)),
    3_000,
  );
}

async function trackedSettlements<T>(operations: Array<Tracked<T>>) {
  await settleTracked(operations);
  const results: Array<PromiseSettledResult<T>> = [];
  for (const operation of operations) {
    results.push(await operation.settlement);
  }
  return results;
}

async function trackedValues<T>(operations: Array<Tracked<T>>) {
  const settlements = await trackedSettlements(operations);
  return settlements.map((settlement) => {
    if (settlement.status === "rejected") throw settlement.reason;
    return settlement.value;
  });
}

function holdProductLock(productId: string) {
  let release: () => void = () => undefined;
  let ready: (pid: number) => void = () => undefined;
  let rejectReady: (error: unknown) => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<number>((resolve, reject) => {
    ready = resolve;
    rejectReady = reject;
  });
  const transaction = track(
    "product KEY SHARE barrier",
    prisma
      .$transaction(async (tx) => {
        const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid() AS pid
    `;
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR KEY SHARE`;
        ready(pid);
        await released;
      })
      .catch((error) => {
        rejectReady(error);
        throw error;
      }),
  );
  return {
    locked: bounded("product barrier acquisition", locked),
    release,
    transaction,
  };
}

function holdOrderLock(orderId: string) {
  let release: () => void = () => undefined;
  let ready: (pid: number) => void = () => undefined;
  let rejectReady: (error: unknown) => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<number>((resolve, reject) => {
    ready = resolve;
    rejectReady = reject;
  });
  const transaction = track(
    "order KEY SHARE barrier",
    prisma
      .$transaction(async (tx) => {
        const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid() AS pid
    `;
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR KEY SHARE`;
        ready(pid);
        await released;
      })
      .catch((error) => {
        rejectReady(error);
        throw error;
      }),
  );
  return {
    locked: bounded("order barrier acquisition", locked),
    release,
    transaction,
  };
}

async function cleanupOrders() {
  const groups = await prisma.checkoutGroup.findMany({
    where: { customerId: { in: [ids.customerA, ids.customerB, ids.disabled] } },
    select: {
      id: true,
      orders: { select: { id: true, items: { select: { id: true } } } },
    },
  });
  const orderIds = groups.flatMap((group) =>
    group.orders.map((order) => order.id),
  );
  const itemIds = groups.flatMap((group) =>
    group.orders.flatMap((order) => order.items.map((item) => item.id)),
  );
  await prisma.stockMovement.deleteMany({
    where: { orderItemId: { in: itemIds } },
  });
  await prisma.orderItem.deleteMany({ where: { id: { in: itemIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.checkoutGroup.deleteMany({
    where: { id: { in: groups.map((group) => group.id) } },
  });
  await prisma.product.updateMany({
    where: {
      id: {
        in: [
          ids.productA,
          ids.productB,
          ids.archivedProduct,
          ids.inactiveProduct,
          ids.disabledProduct,
          ids.overflowLine,
          ids.overflowA,
          ids.overflowB,
        ],
      },
    },
    data: { stockQuantity: 10 },
  });
  await prisma.product.updateMany({
    where: { id: ids.raceProduct },
    data: { stockQuantity: 1 },
  });
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ids.customerA,
        name: "Customer A",
        email: `${ids.customerA}@example.test`,
        role: Role.CUSTOMER,
      },
      {
        id: ids.customerB,
        name: "Customer B",
        email: `${ids.customerB}@example.test`,
        role: Role.CUSTOMER,
      },
      {
        id: ids.disabled,
        name: "Disabled",
        email: `${ids.disabled}@example.test`,
        role: Role.CUSTOMER,
        disabledAt: new Date(),
      },
      {
        id: ids.supplierA,
        name: "Supplier A",
        email: `${ids.supplierA}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.supplierB,
        name: "Supplier B",
        email: `${ids.supplierB}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.admin,
        name: "Admin",
        email: `${ids.admin}@example.test`,
        role: Role.ADMIN,
      },
    ],
  });
  await prisma.category.createMany({
    data: [
      { id: ids.category, name: "Active", slug: `${run}-active` },
      {
        id: ids.archivedCategory,
        name: "Inactive",
        slug: `${run}-inactive`,
        archivedAt: new Date(),
      },
    ],
  });
  const product = (
    id: string,
    supplierId: string,
    categoryId = ids.category,
    archivedAt: Date | null = null,
  ) => ({
    id,
    supplierId,
    categoryId,
    name: id,
    description: "Order integration product",
    priceMinor: 250n,
    currency: "AED",
    stockQuantity: 10,
    imageUrl: "https://example.test/product.png",
    imageStorageKey: "external:test",
    archivedAt,
  });
  await prisma.product.createMany({
    data: [
      product(ids.productA, ids.supplierA),
      { ...product(ids.productB, ids.supplierB), currency: "USD" },
      product(ids.archivedProduct, ids.supplierA, ids.category, new Date()),
      product(ids.inactiveProduct, ids.supplierA, ids.archivedCategory),
      product(ids.disabledProduct, ids.disabled),
      { ...product(ids.raceProduct, ids.supplierA), stockQuantity: 1 },
      {
        ...product(ids.overflowLine, ids.supplierA),
        priceMinor: POSTGRES_BIGINT_MAX / 2n + 1n,
      },
      {
        ...product(ids.overflowA, ids.supplierA),
        priceMinor: POSTGRES_BIGINT_MAX / 2n + 2n,
      },
      {
        ...product(ids.overflowB, ids.supplierA),
        priceMinor: POSTGRES_BIGINT_MAX / 2n,
      },
    ],
  });
});

afterEach(cleanupOrders);
afterAll(async () => {
  await cleanupOrders();
  await prisma.product.deleteMany({
    where: {
      id: {
        in: [
          ids.productA,
          ids.productB,
          ids.archivedProduct,
          ids.inactiveProduct,
          ids.disabledProduct,
          ids.raceProduct,
          ids.overflowLine,
          ids.overflowA,
          ids.overflowB,
        ],
      },
    },
  });
  await prisma.category.deleteMany({
    where: { id: { in: [ids.category, ids.archivedCategory] } },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          ids.customerA,
          ids.customerB,
          ids.disabled,
          ids.supplierA,
          ids.supplierB,
          ids.admin,
        ],
      },
    },
  });
});

describe("transactional orders", () => {
  it("creates supplier-specific orders atomically with database prices, totals, decrements, and movements", async () => {
    const result = await placeOrder(
      customerA,
      request(key(), [
        [ids.productA, "2"],
        [ids.productB, "3"],
      ]),
    );
    const orders = await prisma.order.findMany({
      where: { checkoutGroupId: result.checkoutGroupId },
      include: { items: true },
    });
    expect(orders).toHaveLength(2);
    expect(orders.map((order) => order.currency).sort()).toEqual([
      "AED",
      "USD",
    ]);
    expect(orders.map((order) => order.supplierId).sort()).toEqual(
      [ids.supplierA, ids.supplierB].sort(),
    );
    expect(
      orders
        .flatMap((order) => order.items)
        .map((item) => [item.unitPriceMinor, item.lineTotalMinor]),
    ).toEqual(
      expect.arrayContaining([
        [250n, 500n],
        [250n, 750n],
      ]),
    );
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } }),
    ).toMatchObject({ stockQuantity: 8 });
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: ids.productB } }),
    ).toMatchObject({ stockQuantity: 7 });
    expect(
      await prisma.stockMovement.count({
        where: {
          orderItem: { order: { checkoutGroupId: result.checkoutGroupId } },
          type: StockMovementType.ORDER_DECREMENT,
        },
      }),
    ).toBe(2);
  });

  it("derives currency and price from PostgreSQL, ignoring caller extras", async () => {
    const result = await placeOrder(customerA, {
      idempotencyKey: key(),
      items: [
        {
          productId: ids.productB,
          quantity: "2",
          currency: "AED",
          priceMinor: "1",
        },
      ],
    });
    const order = await prisma.order.findFirstOrThrow({
      where: { checkoutGroupId: result.checkoutGroupId },
      include: { items: true },
    });
    expect(order).toMatchObject({ currency: "USD", totalMinor: 500n });
    expect(order.items[0]).toMatchObject({
      unitPriceMinor: 250n,
      lineTotalMinor: 500n,
    });
  });

  it.each([
    ["line multiplication", [[ids.overflowLine, "2"]]],
    [
      "order accumulation",
      [
        [ids.overflowA, "1"],
        [ids.overflowB, "1"],
      ],
    ],
  ] as const)(
    "rejects %s BIGINT overflow and rolls back",
    async (_label, lines) => {
      const idempotencyKey = key();
      let caught: unknown;
      try {
        await placeOrder(customerA, request(idempotencyKey, [...lines]));
      } catch (error) {
        caught = error;
      }
      expect(serializeError(caught)).toEqual({
        code: "VALIDATION_FAILED",
        message: "The order total is above the supported maximum.",
      });
      expect(
        await prisma.checkoutGroup.count({
          where: { customerId: ids.customerA, idempotencyKey },
        }),
      ).toBe(0);
      expect(
        await prisma.order.count({ where: { customerId: ids.customerA } }),
      ).toBe(0);
      expect(
        await prisma.stockMovement.count({
          where: { productId: { in: lines.map(([id]) => id) } },
        }),
      ).toBe(0);
      for (const [id] of lines)
        expect(
          (await prisma.product.findUniqueOrThrow({ where: { id } }))
            .stockQuantity,
        ).toBe(10);
    },
  );

  it("rejects non-customer and disabled actors", async () => {
    await expect(
      placeOrder(supplierA, request(key(), [[ids.productA, "1"]])),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      placeOrder(
        actor(ids.disabled, Role.CUSTOMER, new Date()),
        request(key(), [[ids.productA, "1"]]),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each([
    ["missing", `${run}-missing`],
    ["archived", ids.archivedProduct],
    ["inactive category", ids.inactiveProduct],
    ["disabled supplier", ids.disabledProduct],
  ])(
    "rolls back the complete checkout for %s products",
    async (_label, badId) => {
      await expect(
        placeOrder(
          customerA,
          request(key(), [
            [ids.productA, "2"],
            [badId, "1"],
          ]),
        ),
      ).rejects.toBeTruthy();
      expect(
        await prisma.order.count({ where: { customerId: ids.customerA } }),
      ).toBe(0);
      expect(
        await prisma.stockMovement.count({
          where: { productId: ids.productA },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.product.findUniqueOrThrow({
            where: { id: ids.productA },
          })
        ).stockQuantity,
      ).toBe(10);
    },
  );

  it("rejects insufficient stock without partial writes", async () => {
    await expect(
      placeOrder(
        customerA,
        request(key(), [
          [ids.productA, "2"],
          [ids.raceProduct, "2"],
        ]),
      ),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(
      await prisma.order.count({ where: { customerId: ids.customerA } }),
    ).toBe(0);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } }))
        .stockQuantity,
    ).toBe(10);
  });

  it("replays an identical durable key and rejects a conflicting payload", async () => {
    const idempotencyKey = key();
    const first = await placeOrder(
      customerA,
      request(idempotencyKey, [[ids.productA, "2"]]),
    );
    const repeat = await placeOrder(
      customerA,
      request(idempotencyKey, [[ids.productA, "2"]]),
    );
    expect(repeat).toEqual({
      checkoutGroupId: first.checkoutGroupId,
      repeated: true,
    });
    await expect(
      placeOrder(customerA, request(idempotencyKey, [[ids.productA, "3"]])),
    ).rejects.toMatchObject({ code: "DUPLICATE_REQUEST" });
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } }))
        .stockQuantity,
    ).toBe(8);
  });

  it("replays identical lines in a different order", async () => {
    const idempotencyKey = key();
    const first = await placeOrder(
      customerA,
      request(idempotencyKey, [
        [ids.productA, "1"],
        [ids.productB, "2"],
      ]),
    );
    const replay = await placeOrder(
      customerA,
      request(idempotencyKey, [
        [ids.productB, "2"],
        [ids.productA, "1"],
      ]),
    );
    expect(replay).toEqual({
      checkoutGroupId: first.checkoutGroupId,
      repeated: true,
    });
  });

  it("serializes concurrent conflicting payloads without partial writes", async () => {
    const idempotencyKey = key();
    const operations = [
      track(
        "conflicting idempotency checkout for product A",
        placeOrder(customerA, request(idempotencyKey, [[ids.productA, "2"]])),
      ),
      track(
        "conflicting idempotency checkout for product B",
        placeOrder(customerA, request(idempotencyKey, [[ids.productB, "3"]])),
      ),
    ];
    const outcomes = await trackedSettlements(operations);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "DUPLICATE_REQUEST" } });
    expect(
      await prisma.checkoutGroup.count({
        where: { customerId: ids.customerA, idempotencyKey },
      }),
    ).toBe(1);
    expect(
      await prisma.order.count({
        where: { checkoutGroup: { customerId: ids.customerA, idempotencyKey } },
      }),
    ).toBe(1);
    const stocks = await prisma.product.findMany({
      where: { id: { in: [ids.productA, ids.productB] } },
      select: { id: true, stockQuantity: true },
    });
    expect(stocks).toSatisfy(
      (rows: typeof stocks) =>
        rows.some((row) => row.stockQuantity < 10) &&
        rows.some((row) => row.stockQuantity === 10),
    );
  });

  it("serializes concurrent identical keys into one checkout", async () => {
    const idempotencyKey = key();
    const outcomes = await trackedValues([
      track(
        "first identical idempotency checkout",
        placeOrder(customerA, request(idempotencyKey, [[ids.productA, "2"]])),
      ),
      track(
        "second identical idempotency checkout",
        placeOrder(customerA, request(idempotencyKey, [[ids.productA, "2"]])),
      ),
    ]);
    expect(
      new Set(outcomes.map((outcome) => outcome.checkoutGroupId)).size,
    ).toBe(1);
    expect(outcomes.filter((outcome) => outcome.repeated)).toHaveLength(1);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } }))
        .stockQuantity,
    ).toBe(8);
  });

  it("proves production checkout blocks at the explicit Product locking SELECT", async () => {
    const barrier = holdProductLock(ids.productA);
    let checkout: Tracked<Awaited<ReturnType<typeof placeOrder>>> | undefined;
    let testError: unknown;
    try {
      const blockerPid = await barrier.locked;
      checkout = track(
        "production checkout explicit Product lock",
        placeOrder(customerA, request(key(), [[ids.productA, "1"]])),
      );
      const blocked = await waitForBlockedBy(blockerPid, [
        'SELECT p."id"',
        "FOR UPDATE OF p",
      ]);
      if (process.env.REPORT_LOCK_PIDS === "true") {
        console.info(
          `product explicit-lock graph: ${blockerPid} -> ${blocked.pid}`,
        );
      }
      expect(blocked.query.trimStart().startsWith("UPDATE")).toBe(false);
    } catch (error) {
      testError = error;
    } finally {
      barrier.release();
      await settleTracked([barrier.transaction, checkout]);
    }
    if (testError) throw testError;
    expect((await checkout!.settlement).status).toBe("fulfilled");
  }, 15_000);

  it("allows only one racer to buy the last unit", async () => {
    const outcomes = await trackedSettlements([
      track(
        "customer A last-stock checkout",
        placeOrder(customerA, request(key(), [[ids.raceProduct, "1"]])),
      ),
      track(
        "customer B last-stock checkout",
        placeOrder(customerB, request(key(), [[ids.raceProduct, "1"]])),
      ),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    expect(
      (
        await prisma.product.findUniqueOrThrow({
          where: { id: ids.raceProduct },
        })
      ).stockQuantity,
    ).toBe(0);
    expect(
      await prisma.stockMovement.count({
        where: { productId: ids.raceProduct },
      }),
    ).toBe(1);
  }, 15_000);

  it("enforces supplier ownership and the forward transition policy", async () => {
    const placed = await placeOrder(
      customerA,
      request(key(), [[ids.productA, "1"]]),
    );
    const order = await prisma.order.findFirstOrThrow({
      where: { checkoutGroupId: placed.checkoutGroupId },
    });
    await expect(
      transitionOrder(supplierB, order.id, OrderStatus.CONFIRMED),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      transitionOrder(customerA, order.id, OrderStatus.CONFIRMED),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    await transitionOrder(supplierA, order.id, OrderStatus.CONFIRMED);
    await transitionOrder(admin, order.id, OrderStatus.SHIPPED);
    await transitionOrder(supplierA, order.id, OrderStatus.DELIVERED);
    await expect(
      transitionOrder(admin, order.id, OrderStatus.CANCELLED),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
  });

  it("cancels once, restores exact stock, and records compensation", async () => {
    const placed = await placeOrder(
      customerA,
      request(key(), [[ids.productA, "3"]]),
    );
    const order = await prisma.order.findFirstOrThrow({
      where: { checkoutGroupId: placed.checkoutGroupId },
    });
    await transitionOrder(customerA, order.id, OrderStatus.CANCELLED);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } }))
        .stockQuantity,
    ).toBe(10);
    expect(
      await prisma.stockMovement.count({
        where: {
          orderItem: { orderId: order.id },
          type: StockMovementType.CANCELLATION_RESTORE,
        },
      }),
    ).toBe(1);
    await expect(
      transitionOrder(customerA, order.id, OrderStatus.CANCELLED),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } }))
        .stockQuantity,
    ).toBe(10);
  });

  it.each([
    ["supplier", supplierA, OrderStatus.PENDING],
    ["supplier", supplierA, OrderStatus.CONFIRMED],
    ["admin", admin, OrderStatus.PENDING],
    ["admin", admin, OrderStatus.CONFIRMED],
  ] as const)(
    "allows %s cancellation from %s",
    async (_label, cancellationActor, startingStatus) => {
      const placed = await placeOrder(
        customerA,
        request(key(), [[ids.productA, "2"]]),
      );
      const order = await prisma.order.findFirstOrThrow({
        where: { checkoutGroupId: placed.checkoutGroupId },
      });
      if (startingStatus === OrderStatus.CONFIRMED)
        await transitionOrder(supplierA, order.id, OrderStatus.CONFIRMED);
      await transitionOrder(cancellationActor, order.id, OrderStatus.CANCELLED);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
          .status,
      ).toBe(OrderStatus.CANCELLED);
      expect(
        (
          await prisma.product.findUniqueOrThrow({
            where: { id: ids.productA },
          })
        ).stockQuantity,
      ).toBe(10);
    },
  );

  it("restores stock when a purchased product is archived later", async () => {
    const placed = await placeOrder(
      customerA,
      request(key(), [[ids.productA, "2"]]),
    );
    const order = await prisma.order.findFirstOrThrow({
      where: { checkoutGroupId: placed.checkoutGroupId },
    });
    await prisma.product.update({
      where: { id: ids.productA },
      data: { archivedAt: new Date() },
    });
    try {
      await transitionOrder(customerA, order.id, OrderStatus.CANCELLED);
      expect(
        (
          await prisma.product.findUniqueOrThrow({
            where: { id: ids.productA },
          })
        ).stockQuantity,
      ).toBe(10);
    } finally {
      await prisma.product.update({
        where: { id: ids.productA },
        data: { archivedAt: null },
      });
    }
  });

  it("reloads changed actor role and disabled state before mutation", async () => {
    const placed = await placeOrder(
      customerA,
      request(key(), [[ids.productA, "1"]]),
    );
    const order = await prisma.order.findFirstOrThrow({
      where: { checkoutGroupId: placed.checkoutGroupId },
    });
    await prisma.user.update({
      where: { id: ids.supplierA },
      data: { role: Role.CUSTOMER },
    });
    try {
      await expect(
        transitionOrder(supplierA, order.id, OrderStatus.CONFIRMED),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await prisma.user.update({
        where: { id: ids.supplierA },
        data: { role: Role.SUPPLIER, disabledAt: new Date() },
      });
    }
    try {
      await expect(
        transitionOrder(supplierA, order.id, OrderStatus.CONFIRMED),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await prisma.user.update({
        where: { id: ids.supplierA },
        data: { disabledAt: null },
      });
    }
  });

  it("proves production cancellation blocks at the explicit Order locking SELECT", async () => {
    const placed = await placeOrder(
      customerA,
      request(key(), [[ids.productA, "2"]]),
    );
    const order = await prisma.order.findFirstOrThrow({
      where: { checkoutGroupId: placed.checkoutGroupId },
    });
    const barrier = holdOrderLock(order.id);
    let cancellation:
      Tracked<Awaited<ReturnType<typeof transitionOrder>>> | undefined;
    let testError: unknown;
    try {
      const blockerPid = await barrier.locked;
      cancellation = track(
        "production cancellation explicit Order lock",
        transitionOrder(customerA, order.id, OrderStatus.CANCELLED),
      );
      const blocked = await waitForBlockedBy(blockerPid, [
        'SELECT "id", "customerId", "supplierId", "status"',
        "FOR UPDATE",
      ]);
      if (process.env.REPORT_LOCK_PIDS === "true") {
        console.info(
          `order explicit-lock graph: ${blockerPid} -> ${blocked.pid}`,
        );
      }
      expect(blocked.query.trimStart().startsWith("UPDATE")).toBe(false);
    } catch (error) {
      testError = error;
    } finally {
      barrier.release();
      await settleTracked([barrier.transaction, cancellation]);
    }
    if (testError) throw testError;
    expect((await cancellation!.settlement).status).toBe("fulfilled");
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } }))
        .stockQuantity,
    ).toBe(10);
  }, 15_000);

  it("allows only one concurrent cancellation to restore stock", async () => {
    const placed = await placeOrder(
      customerA,
      request(key(), [[ids.productA, "2"]]),
    );
    const order = await prisma.order.findFirstOrThrow({
      where: { checkoutGroupId: placed.checkoutGroupId },
    });
    const outcomes = await trackedSettlements([
      track(
        "first concurrent cancellation",
        transitionOrder(customerA, order.id, OrderStatus.CANCELLED),
      ),
      track(
        "second concurrent cancellation",
        transitionOrder(customerA, order.id, OrderStatus.CANCELLED),
      ),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } }))
        .stockQuantity,
    ).toBe(10);
  });

  it("serializes cancellation against a forward transition", async () => {
    const placed = await placeOrder(
      customerA,
      request(key(), [[ids.productA, "2"]]),
    );
    const order = await prisma.order.findFirstOrThrow({
      where: { checkoutGroupId: placed.checkoutGroupId },
    });
    const outcomes = await trackedSettlements([
      track(
        "customer cancellation racing confirmation",
        transitionOrder(customerA, order.id, OrderStatus.CANCELLED),
      ),
      track(
        "supplier confirmation racing cancellation",
        transitionOrder(supplierA, order.id, OrderStatus.CONFIRMED),
      ),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    const stock = (
      await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } })
    ).stockQuantity;
    const restores = await prisma.stockMovement.count({
      where: {
        orderItem: { orderId: order.id },
        type: StockMovementType.CANCELLATION_RESTORE,
      },
    });
    expect([OrderStatus.CANCELLED, OrderStatus.CONFIRMED]).toContain(
      saved.status,
    );
    expect(
      saved.status === OrderStatus.CANCELLED
        ? [stock, restores]
        : [stock, restores],
    ).toEqual(saved.status === OrderStatus.CANCELLED ? [10, 1] : [8, 0]);
  });

  it("rolls back cancellation if a compensating movement conflicts", async () => {
    const placed = await placeOrder(
      customerA,
      request(key(), [[ids.productA, "2"]]),
    );
    const order = await prisma.order.findFirstOrThrow({
      where: { checkoutGroupId: placed.checkoutGroupId },
      include: { items: true },
    });
    await prisma.stockMovement.create({
      data: {
        productId: ids.productA,
        orderItemId: order.items[0].id,
        type: StockMovementType.CANCELLATION_RESTORE,
        quantityDelta: 2,
      },
    });
    await expect(
      transitionOrder(customerA, order.id, OrderStatus.CANCELLED),
    ).rejects.toBeTruthy();
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe(OrderStatus.PENDING);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: ids.productA } }))
        .stockQuantity,
    ).toBe(8);
  });

  it("scopes safe read DTOs to customer, supplier, and admin ownership", async () => {
    const placed = await placeOrder(
      customerA,
      request(key(), [
        [ids.productA, "1"],
        [ids.productB, "1"],
      ]),
    );
    expect(await listOrders(customerA)).toHaveLength(2);
    expect(await listOrders(customerB)).toHaveLength(0);
    expect(await listOrders(supplierA)).toHaveLength(1);
    expect(await listOrders(admin)).toHaveLength(2);
    const order = await prisma.order.findFirstOrThrow({
      where: {
        checkoutGroupId: placed.checkoutGroupId,
        supplierId: ids.supplierA,
      },
    });
    await expect(getOrder(supplierB, order.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const safe = await getOrder(customerA, order.id);
    const expectedOrderKeys = [
      "cancelledAt",
      "checkoutGroupId",
      "confirmedAt",
      "createdAt",
      "currency",
      "customer",
      "deliveredAt",
      "formattedTotal",
      "id",
      "items",
      "shippedAt",
      "status",
      "subtotalMinor",
      "supplier",
      "totalMinor",
    ].sort();
    const expectedItemKeys = [
      "formattedLineTotal",
      "formattedUnitPrice",
      "id",
      "lineTotalMinor",
      "productId",
      "productNameSnapshot",
      "quantity",
      "unitPriceMinor",
    ].sort();
    for (const viewActor of [customerA, supplierA, admin]) {
      const view = await getOrder(viewActor, order.id);
      expect(Object.keys(view).sort()).toEqual(expectedOrderKeys);
      expect(Object.keys(view.customer).sort()).toEqual(["id", "name"]);
      expect(Object.keys(view.supplier).sort()).toEqual(["id", "name"]);
      expect(Object.keys(view.items[0]).sort()).toEqual(expectedItemKeys);
    }
    expect(safe.customer).toEqual({ id: ids.customerA, name: "Customer A" });
  });
});
