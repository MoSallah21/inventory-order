import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/modules/auth/authorization";
import {
  archiveCategory,
  archiveProduct,
  createCategory,
  createProduct,
  getPublicProduct,
  getSupplierProduct,
  listPublicProducts,
  listSupplierProducts,
  parseAedPrice,
  updateCategory,
  updateProduct,
} from "@/modules/catalog/service";

const run = `catalog-test-${randomUUID()}`;
const ids = {
  admin: `${run}-admin`,
  supplierA: `${run}-supplier-a`,
  supplierB: `${run}-supplier-b`,
  disabledSupplier: `${run}-supplier-disabled`,
  customer: `${run}-customer`,
  activeCategory: `${run}-category-active`,
  archivedCategory: `${run}-category-archived`,
};

function actor(id: string, role: Role, disabledAt: Date | null = null): Actor {
  return { id, role, disabledAt, name: id, email: `${id}@example.test` };
}

const admin = actor(ids.admin, Role.ADMIN);
const supplierA = actor(ids.supplierA, Role.SUPPLIER);
const supplierB = actor(ids.supplierB, Role.SUPPLIER);
const customer = actor(ids.customer, Role.CUSTOMER);

const productInput = {
  name: "Integration Widget",
  description: "A database-backed integration test product.",
  categoryId: ids.activeCategory,
  price: "42.95",
  stockQuantity: 7,
  imageUrl: "https://example.test/catalog-product.png",
};

const productIds: string[] = [];
const categoryIds = [ids.activeCategory, ids.archivedCategory];

type TrackedOperation<T> = {
  name: string;
  promise: Promise<T>;
  settlement: Promise<
    { status: "fulfilled"; value: T } | { status: "rejected"; error: unknown }
  >;
  settled: boolean;
};

function trackOperation<T>(
  name: string,
  promise: Promise<T>,
): TrackedOperation<T> {
  const operation: TrackedOperation<T> = {
    name,
    promise,
    settled: false,
    settlement: Promise.resolve({ status: "fulfilled", value: undefined as T }),
  };
  operation.settlement = promise
    .then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    )
    .finally(() => {
      operation.settled = true;
    });
  return operation;
}

async function settleOperations(
  operations: Array<TrackedOperation<unknown> | undefined>,
  timeoutMs = 5_000,
) {
  const pending = operations.filter(
    (operation): operation is TrackedOperation<unknown> => Boolean(operation),
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(pending.map((operation) => operation.settlement)),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const names = pending
            .filter((operation) => !operation.settled)
            .map((operation) => operation.name);
          reject(
            new Error(
              `Timed out waiting for operations to settle: ${names.join(", ")}`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

type BlockedBackend = { pid: number; query: string; blockingPids: number[] };

async function waitForBackendBlockedBy(
  blockerPid: number,
  expectedQueryFragment: string,
) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const candidates = await prisma.$queryRaw<BlockedBackend[]>`
      SELECT
        activity.pid,
        activity.query,
        pg_blocking_pids(activity.pid) AS "blockingPids"
      FROM pg_stat_activity AS activity
      WHERE activity.datname = current_database()
        AND activity.pid <> pg_backend_pid()
        AND ${blockerPid} = ANY(pg_blocking_pids(activity.pid))
    `;
    if (candidates.length > 1) {
      throw new Error(
        `Expected one backend blocked by PID ${blockerPid}, found: ${candidates
          .map(({ pid, query }) => `${pid}:${query.slice(0, 120)}`)
          .join(" | ")}`,
      );
    }
    const candidate = candidates[0];
    if (candidate) {
      if (!candidate.query.includes(expectedQueryFragment)) {
        throw new Error(
          `Backend ${candidate.pid} blocked by PID ${blockerPid} had unexpected query: ${candidate.query.slice(0, 160)}`,
        );
      }
      return candidate;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Expected one ${expectedQueryFragment} backend blocked by PID ${blockerPid}.`,
  );
}

async function lockTestCategory(
  tx: Prisma.TransactionClient,
  categoryId: string,
) {
  await tx.$queryRaw`
    SELECT "id"
    FROM "Category"
    WHERE "id" = ${categoryId}
    FOR UPDATE
  `;
}

function holdProductTableForUpdateBarrier() {
  let release = () => {};
  let reportReady: (pid: number) => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<number>((resolve) => {
    reportReady = resolve;
  });
  const transaction = trackOperation(
    "product table barrier",
    prisma.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid() AS pid
    `;
      await tx.$executeRaw`LOCK TABLE "Product" IN SHARE MODE`;
      reportReady(pid);
      await released;
    }),
  );
  return { ready, release, transaction };
}

function holdCategoryTableForArchiveBarrier() {
  let release = () => {};
  let reportReady: (pid: number) => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<number>((resolve) => {
    reportReady = resolve;
  });
  const transaction = trackOperation(
    "category table barrier",
    prisma.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
      SELECT pg_backend_pid() AS pid
    `;
      await tx.$executeRaw`LOCK TABLE "Category" IN SHARE MODE`;
      reportReady(pid);
      await released;
    }),
  );
  return { ready, release, transaction };
}

function databaseProductData(
  id: string,
  supplierId: string,
  categoryId: string,
) {
  return {
    id,
    supplierId,
    categoryId,
    name: productInput.name,
    description: productInput.description,
    priceMinor: 100n,
    currency: "AED",
    stockQuantity: productInput.stockQuantity,
    imageUrl: productInput.imageUrl,
    imageStorageKey: "external:test",
  };
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ids.admin,
        name: "Test Admin",
        email: `${ids.admin}@example.test`,
        role: Role.ADMIN,
      },
      {
        id: ids.supplierA,
        name: "Test Supplier A",
        email: `${ids.supplierA}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.supplierB,
        name: "Test Supplier B",
        email: `${ids.supplierB}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.disabledSupplier,
        name: "Disabled Test Supplier",
        email: `${ids.disabledSupplier}@example.test`,
        role: Role.SUPPLIER,
        disabledAt: new Date(),
      },
      {
        id: ids.customer,
        name: "Test Customer",
        email: `${ids.customer}@example.test`,
        role: Role.CUSTOMER,
      },
    ],
  });
  await prisma.category.createMany({
    data: [
      {
        id: ids.activeCategory,
        name: "Integration Active",
        slug: `${run}-active`,
      },
      {
        id: ids.archivedCategory,
        name: "Integration Archived",
        slug: `${run}-archived`,
        archivedAt: new Date(),
      },
    ],
  });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.deleteMany({
    where: { id: { in: categoryIds } },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          ids.admin,
          ids.supplierA,
          ids.supplierB,
          ids.disabledSupplier,
          ids.customer,
        ],
      },
    },
  });
});

describe("catalog PostgreSQL integration", () => {
  it("rejects category mutations by non-admin actors", async () => {
    await expect(
      createCategory(supplierA, { name: "Denied", slug: `${run}-denied` }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateCategory(supplierA, ids.activeCategory, {
        name: "Denied",
        slug: `${run}-denied-update`,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      archiveCategory(supplierA, ids.activeCategory),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps duplicate category slugs to a typed conflict", async () => {
    await expect(
      createCategory(admin, { name: "Duplicate", slug: `${run}-active` }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects an archived category for product assignment", async () => {
    await expect(
      createProduct(supplierA, {
        ...productInput,
        categoryId: ids.archivedCategory,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const persisted = await prisma.product.findFirst({
      where: {
        supplierId: ids.supplierA,
        categoryId: ids.archivedCategory,
        name: productInput.name,
      },
    });
    expect(persisted).toBeNull();
  });

  it("rejects invalid HTTPS image input", async () => {
    await expect(
      createProduct(supplierA, {
        ...productInput,
        imageUrl: "http://example.test/image.png",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects a disabled actor at a catalog mutation entry point", async () => {
    await expect(
      createProduct(
        actor(ids.disabledSupplier, Role.SUPPLIER, new Date()),
        productInput,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates and edits only the authenticated supplier's product", async () => {
    const created = await createProduct(supplierA, productInput);
    productIds.push(created.id);
    expect(created.supplierId).toBe(ids.supplierA);
    const updated = await updateProduct(supplierA, created.id, {
      ...productInput,
      name: "Updated Widget",
      stockQuantity: 9,
    });
    expect(updated).toMatchObject({
      name: "Updated Widget",
      stockQuantity: 9,
      supplierId: ids.supplierA,
    });
  });

  it("does not allow a supplier to query or mutate another supplier's product", async () => {
    const owned = await createProduct(supplierB, {
      ...productInput,
      name: "Supplier B Product",
    });
    productIds.push(owned.id);
    await expect(getSupplierProduct(supplierA, owned.id)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    await expect(
      updateProduct(supplierA, owned.id, productInput),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(archiveProduct(supplierA, owned.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const visible = await listSupplierProducts(supplierA);
    expect(visible.some((product) => product.id === owned.id)).toBe(false);
  });

  it("derives supplier identity from the actor rather than product input", async () => {
    const created = await createProduct(supplierA, productInput);
    productIds.push(created.id);
    expect(created.supplierId).toBe(supplierA.id);
    expect("supplierId" in productInput).toBe(false);
  });

  it("rejects negative and non-integer stock", async () => {
    await expect(
      createProduct(supplierA, { ...productInput, stockQuantity: -1 }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      createProduct(supplierA, { ...productInput, stockQuantity: 1.5 }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects invalid and over-precision AED prices", () => {
    expect(() => parseAedPrice("12.345")).toThrowError(AppError);
    expect(() => parseAedPrice("-1.00")).toThrowError(AppError);
    expect(() => parseAedPrice("AED 10")).toThrowError(AppError);
    expect(parseAedPrice("12.30")).toBe(1230n);
  });

  it("archives products without deleting their records", async () => {
    const created = await createProduct(supplierA, productInput);
    productIds.push(created.id);
    await archiveProduct(supplierA, created.id);
    const persisted = await prisma.product.findUnique({
      where: { id: created.id },
    });
    expect(persisted?.archivedAt).toBeInstanceOf(Date);
  });

  it("treats repeated category archival as a controlled idempotent result", async () => {
    const category = await createCategory(admin, {
      name: "Repeat Archive",
      slug: `${run}-repeat-archive`,
    });
    categoryIds.push(category.id);
    const first = await archiveCategory(admin, category.id);
    const second = await archiveCategory(admin, category.id);
    expect(second.archivedAt).toEqual(first.archivedAt);
  });

  it("makes a product create wait for archival and then reject the archived category", async () => {
    let releaseLock = () => {};
    let reportLocked: (pid: number) => void = () => undefined;
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const locked = new Promise<number>((resolve) => {
      reportLocked = resolve;
    });
    const holder = trackOperation(
      "create archive-first barrier",
      prisma.$transaction(async (tx) => {
        const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid() AS pid
      `;
        await lockTestCategory(tx, ids.activeCategory);
        await tx.category.update({
          where: { id: ids.activeCategory },
          data: { archivedAt: new Date() },
        });
        reportLocked(pid);
        await release;
      }),
    );
    let mutation:
      TrackedOperation<Awaited<ReturnType<typeof createProduct>>> | undefined;
    try {
      const holderPid = await locked;
      mutation = trackOperation(
        "blocked product create",
        createProduct(supplierA, {
          ...productInput,
          name: "Blocked Create",
        }),
      );
      await waitForBackendBlockedBy(holderPid, 'FROM "Category"');
      releaseLock();
      await holder.promise;
      await expect(mutation.settlement).resolves.toMatchObject({
        status: "rejected",
        error: { code: "VALIDATION_FAILED" },
      });
      await expect(
        prisma.product.findFirst({
          where: { supplierId: ids.supplierA, name: "Blocked Create" },
        }),
      ).resolves.toBeNull();
    } finally {
      releaseLock();
      await settleOperations([holder, mutation]);
      await prisma.category.update({
        where: { id: ids.activeCategory },
        data: { archivedAt: null },
      });
    }
  });

  it("lets the real update commit before waiting archival, then hides the product", async () => {
    const created = await createProduct(supplierA, {
      ...productInput,
      name: "Update First Original",
    });
    productIds.push(created.id);
    const blocker = holdProductTableForUpdateBarrier();
    let update:
      TrackedOperation<Awaited<ReturnType<typeof updateProduct>>> | undefined;
    let archival:
      TrackedOperation<Awaited<ReturnType<typeof archiveCategory>>> | undefined;
    try {
      const barrierPid = await blocker.ready;
      update = trackOperation(
        "production updateProduct",
        updateProduct(supplierA, created.id, {
          ...productInput,
          name: "Update First Saved",
          description: "The real production update committed before archival.",
          price: "51.25",
          stockQuantity: 11,
          imageUrl: "https://example.test/update-first.png",
        }),
      );
      const updateBackend = await waitForBackendBlockedBy(
        barrierPid,
        'UPDATE "public"."Product"',
      );
      archival = trackOperation(
        "production archiveCategory",
        archiveCategory(admin, ids.activeCategory),
      );
      const archiveBackend = await waitForBackendBlockedBy(
        updateBackend.pid,
        'FROM "Category"',
      );
      if (process.env.REPORT_LOCK_PIDS === "true") {
        console.info(
          `update-first lock graph: ${barrierPid} -> ${updateBackend.pid} -> ${archiveBackend.pid}`,
        );
      }
      blocker.release();
      await blocker.transaction.promise;
      await update.promise;
      await archival.promise;

      const saved = await prisma.product.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(saved).toMatchObject({
        name: "Update First Saved",
        description: "The real production update committed before archival.",
        priceMinor: 5_125n,
        stockQuantity: 11,
        imageUrl: "https://example.test/update-first.png",
      });
      await expect(getPublicProduct(created.id)).resolves.toBeNull();
    } finally {
      blocker.release();
      await settleOperations([blocker.transaction, update, archival]);
      await prisma.category.update({
        where: { id: ids.activeCategory },
        data: { archivedAt: null },
      });
    }
  });

  it("rejects the real update after waiting archival without a partial write", async () => {
    const created = await createProduct(supplierA, {
      ...productInput,
      name: "Archive First Original",
    });
    productIds.push(created.id);
    const blocker = holdCategoryTableForArchiveBarrier();
    let archival:
      TrackedOperation<Awaited<ReturnType<typeof archiveCategory>>> | undefined;
    let update:
      TrackedOperation<Awaited<ReturnType<typeof updateProduct>>> | undefined;
    try {
      const barrierPid = await blocker.ready;
      archival = trackOperation(
        "production archiveCategory",
        archiveCategory(admin, ids.activeCategory),
      );
      const archiveBackend = await waitForBackendBlockedBy(
        barrierPid,
        'UPDATE "public"."Category"',
      );
      update = trackOperation(
        "production updateProduct",
        updateProduct(supplierA, created.id, {
          ...productInput,
          name: "Must Not Persist",
          description: "No attempted field from this update may persist.",
          price: "88.88",
          stockQuantity: 99,
          imageUrl: "https://example.test/must-not-persist.png",
        }),
      );
      const updateBackend = await waitForBackendBlockedBy(
        archiveBackend.pid,
        'FROM "Category"',
      );
      if (process.env.REPORT_LOCK_PIDS === "true") {
        console.info(
          `archive-first lock graph: ${barrierPid} -> ${archiveBackend.pid} -> ${updateBackend.pid}`,
        );
      }
      blocker.release();
      await blocker.transaction.promise;
      await archival.promise;
      const outcome = await update.settlement;
      expect(outcome).toMatchObject({
        status: "rejected",
        error: { code: "VALIDATION_FAILED" },
      });

      const saved = await prisma.product.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(saved).toMatchObject({
        name: created.name,
        description: created.description,
        categoryId: created.categoryId,
        priceMinor: created.priceMinor,
        stockQuantity: created.stockQuantity,
        imageUrl: created.imageUrl,
        imageStorageKey: created.imageStorageKey,
        archivedAt: created.archivedAt,
      });
      await expect(getPublicProduct(created.id)).resolves.toBeNull();
    } finally {
      blocker.release();
      await settleOperations([blocker.transaction, archival, update]);
      await prisma.category.update({
        where: { id: ids.activeCategory },
        data: { archivedAt: null },
      });
    }
  });

  it("filters archived products, archived categories, and disabled suppliers from the public catalog", async () => {
    const archivedProduct = await createProduct(supplierA, productInput);
    productIds.push(archivedProduct.id);
    await archiveProduct(supplierA, archivedProduct.id);
    const archivedCategoryProduct = await prisma.product.create({
      data: databaseProductData(
        `${run}-archived-category-product`,
        ids.supplierA,
        ids.archivedCategory,
      ),
    });
    productIds.push(archivedCategoryProduct.id);
    const disabledSupplierProduct = await prisma.product.create({
      data: databaseProductData(
        `${run}-disabled-supplier-product`,
        ids.disabledSupplier,
        ids.activeCategory,
      ),
    });
    productIds.push(disabledSupplierProduct.id);
    const publicProducts = await listPublicProducts();
    expect(publicProducts.map((product) => product.id)).not.toEqual(
      expect.arrayContaining([
        archivedProduct.id,
        archivedCategoryProduct.id,
        disabledSupplierProduct.id,
      ]),
    );
  });

  it("returns a public DTO without user or authentication fields", async () => {
    const created = await createProduct(supplierA, {
      ...productInput,
      name: "Public DTO Product",
    });
    productIds.push(created.id);
    const dto = await getPublicProduct(created.id);
    expect(dto).toMatchObject({
      id: created.id,
      supplierName: "Test Supplier A",
      formattedPrice: "AED 42.95",
    });
    expect(dto).not.toHaveProperty("supplier");
    expect(dto).not.toHaveProperty("supplierId");
    expect(dto).not.toHaveProperty("password");
    expect(dto).not.toHaveProperty("email");
  });

  it("enforces the non-negative stock check in PostgreSQL", async () => {
    const id = `${run}-negative-stock`;
    productIds.push(id);
    await expect(
      prisma.product.create({
        data: {
          id,
          supplierId: ids.supplierA,
          categoryId: ids.activeCategory,
          name: "Invalid Stock",
          description: "Must be rejected by PostgreSQL.",
          priceMinor: 100n,
          stockQuantity: -1,
          imageUrl: "https://example.test/invalid.png",
          imageStorageKey: "external:test",
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.product.findUnique({ where: { id } }),
    ).resolves.toBeNull();
  });

  it("keeps customer actors outside supplier management", async () => {
    await expect(listSupplierProducts(customer)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
