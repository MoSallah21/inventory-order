import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { Actor } from "@/modules/auth/authorization";
import type {
  ProductImageStorage,
  StoredProductImage,
} from "@/modules/catalog/image-storage";
import type { ValidatedProductImage } from "@/modules/catalog/product-image";
import {
  archiveProduct,
  createProductWithImage,
  removeProductImage,
  updateProductWithImage,
} from "@/modules/catalog/service";

const run = `image-test-${randomUUID()}`;
const ids = {
  supplierA: `${run}-supplier-a`,
  supplierB: `${run}-supplier-b`,
  customer: `${run}-customer`,
  disabled: `${run}-disabled`,
  category: `${run}-category`,
};
const productIds: string[] = [];

function actor(id: string, role: Role = Role.SUPPLIER): Actor {
  return { id, name: id, email: `${id}@example.test`, role, disabledAt: null };
}

const input = {
  name: "Managed image product",
  description: "Lifecycle integration test.",
  categoryId: ids.category,
  price: "12.34",
  stockQuantity: 2,
};
const image: ValidatedProductImage = {
  bytes: Buffer.from([0xff, 0xd8, 0xff]),
  format: "jpg",
  mimeType: "image/jpeg",
  size: 3,
};

class FakeStorage implements ProductImageStorage {
  uploads = 0;
  deletes: string[] = [];
  failUpload = false;
  failDelete = false;

  async upload(): Promise<StoredProductImage> {
    if (this.failUpload) throw new Error("provider detail must stay internal");
    this.uploads += 1;
    const key = `inventory-order/product-images/00000000-0000-4000-8000-${String(this.uploads).padStart(12, "0")}`;
    return {
      url: `https://res.cloudinary.com/test/image/upload/${key}.jpg`,
      storageKey: key,
    };
  }

  async delete(key: string) {
    this.deletes.push(key);
    if (this.failDelete) throw new Error("delete failed");
  }
}

class DeferredStorage implements ProductImageStorage {
  deletes: string[] = [];
  private pending: Array<{
    name: string;
    resolve: (image: StoredProductImage) => void;
    reject: (error: Error) => void;
    settled: boolean;
  }> = [];
  private waiters: Array<{ count: number; resolve: () => void }> = [];

  upload(): Promise<StoredProductImage> {
    const name = `deferred upload ${this.pending.length}`;
    return new Promise((resolve, reject) => {
      this.pending.push({ name, resolve, reject, settled: false });
      for (const waiter of this.waiters) {
        if (this.pending.length >= waiter.count) waiter.resolve();
      }
    });
  }

  async delete(key: string) {
    this.deletes.push(key);
  }

  async waitForUploads(count: number) {
    if (this.pending.length >= count) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(new Error(`Timed out waiting for ${count} deferred uploads`)),
        3_000,
      );
      this.waiters.push({
        count,
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
      });
    });
  }

  resolveUpload(index: number, suffix: string) {
    const key = `inventory-order/product-images/${suffix}`;
    const pending = this.pending[index];
    if (!pending || pending.settled) {
      throw new Error(`Deferred upload ${index} is not pending`);
    }
    pending.settled = true;
    pending.resolve({
      url: `https://res.cloudinary.com/test/image/upload/${key}.jpg`,
      storageKey: key,
    });
  }

  abortPending() {
    for (const pending of this.pending) {
      if (!pending.settled) {
        pending.settled = true;
        pending.reject(new Error(`${pending.name} aborted during cleanup`));
      }
    }
  }
}

type TrackedOperation<T> = {
  name: string;
  settlement: Promise<
    { status: "fulfilled"; value: T } | { status: "rejected"; error: unknown }
  >;
  settled: boolean;
};

function trackOperation<T>(name: string, promise: Promise<T>) {
  const tracked: TrackedOperation<T> = {
    name,
    settled: false,
    settlement: Promise.resolve({ status: "fulfilled", value: undefined as T }),
  };
  tracked.settlement = promise
    .then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    )
    .finally(() => {
      tracked.settled = true;
    });
  return tracked;
}

async function awaitOperationResult<T>(operation: TrackedOperation<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.settlement,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out awaiting ${operation.name}`)),
          3_000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function awaitSuccessfulOperation<T>(operation: TrackedOperation<T>) {
  const result = await awaitOperationResult(operation);
  if (result.status === "rejected") throw result.error;
  return result.value;
}

async function settleOperations(operations: Array<TrackedOperation<unknown>>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(operations.map((operation) => operation.settlement)),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const unfinished = operations
            .filter((operation) => !operation.settled)
            .map((operation) => operation.name);
          reject(
            new Error(
              `Timed out settling image operations: ${unfinished.join(", ")}`,
            ),
          );
        }, 5_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

class DeferredGate {
  private releaseGate!: () => void;
  readonly reached: Promise<void>;
  private reportReached!: () => void;
  readonly wait: Promise<void>;

  constructor(private readonly name: string) {
    this.reached = new Promise((resolve) => {
      this.reportReached = resolve;
    });
    this.wait = new Promise((resolve) => {
      this.releaseGate = resolve;
    });
  }

  async block() {
    this.reportReached();
    await this.wait;
  }

  async waitUntilReached() {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.reached,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Timed out waiting for ${this.name}`)),
            3_000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  release() {
    this.releaseGate();
  }
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ids.supplierA,
        name: "A",
        email: `${ids.supplierA}@test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.supplierB,
        name: "B",
        email: `${ids.supplierB}@test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.customer,
        name: "C",
        email: `${ids.customer}@test`,
        role: Role.CUSTOMER,
      },
      {
        id: ids.disabled,
        name: "D",
        email: `${ids.disabled}@test`,
        role: Role.SUPPLIER,
        disabledAt: new Date(),
      },
    ],
  });
  await prisma.category.create({
    data: { id: ids.category, name: "Image test", slug: `${run}-category` },
  });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.delete({ where: { id: ids.category } });
  await prisma.user.deleteMany({
    where: {
      id: { in: Object.values(ids).filter((id) => id !== ids.category) },
    },
  });
});

describe("managed product image lifecycle", () => {
  it("creates from trusted provider metadata and compensates a database failure", async () => {
    const storage = new FakeStorage();
    const product = await createProductWithImage(
      actor(ids.supplierA),
      input,
      image,
      storage,
    );
    productIds.push(product.id);
    expect(product).toMatchObject({
      supplierId: ids.supplierA,
      imageStorageKey: expect.stringContaining(
        "inventory-order/product-images/",
      ),
    });

    await expect(
      createProductWithImage(
        actor(ids.supplierA),
        { ...input, categoryId: "missing" },
        image,
        storage,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.deletes).toContain(
      "inventory-order/product-images/00000000-0000-4000-8000-000000000002",
    );
  });

  it("does not create a product when upload fails", async () => {
    const storage = new FakeStorage();
    storage.failUpload = true;
    await expect(
      createProductWithImage(actor(ids.supplierA), input, image, storage),
    ).rejects.toThrow();
    expect(
      await prisma.product.count({
        where: { supplierId: ids.supplierA, name: input.name },
      }),
    ).toBe(1);
  });

  it("preserves the database error and signals failed upload compensation", async () => {
    const storage = new FakeStorage();
    storage.failDelete = true;
    const signal = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await expect(
        createProductWithImage(
          actor(ids.supplierA),
          { ...input, categoryId: "missing-compensation-category" },
          image,
          storage,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(signal).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[product-image-cleanup\] upload-compensation key=inventory-order\/product-images\/.+ category=UNEXPECTED_ERROR\n$/,
        ),
      );
    } finally {
      signal.mockRestore();
    }
  });

  it("replaces only an owned image and deletes the old object after commit", async () => {
    const storage = new FakeStorage();
    const product = await createProductWithImage(
      actor(ids.supplierB),
      { ...input, name: "B image" },
      image,
      storage,
    );
    productIds.push(product.id);
    await expect(
      updateProductWithImage(
        actor(ids.supplierA),
        product.id,
        input,
        image,
        false,
        storage,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.uploads).toBe(1);

    const result = await updateProductWithImage(
      actor(ids.supplierB),
      product.id,
      { ...input, name: "B replaced" },
      image,
      false,
      storage,
    );
    expect(result.product.imageStorageKey).not.toBe(product.imageStorageKey);
    expect(storage.deletes).toEqual([product.imageStorageKey]);
  });

  it("clears managed metadata, makes repeat removal idempotent, and reports cleanup failure", async () => {
    const storage = new FakeStorage();
    const product = await createProductWithImage(
      actor(ids.supplierA),
      { ...input, name: "Remove image" },
      image,
      storage,
    );
    productIds.push(product.id);
    storage.failDelete = true;
    await expect(
      removeProductImage(actor(ids.supplierA), product.id, storage),
    ).resolves.toEqual({ cleanupWarning: true });
    await expect(
      removeProductImage(actor(ids.supplierA), product.id, storage),
    ).resolves.toEqual({ cleanupWarning: false });
    const saved = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(saved).toMatchObject({ imageUrl: "", imageStorageKey: "" });
  });

  it("clears a legacy local image without sending it to managed deletion", async () => {
    const storage = new FakeStorage();
    const product = await prisma.product.create({
      data: {
        name: input.name,
        description: input.description,
        categoryId: input.categoryId,
        stockQuantity: input.stockQuantity,
        priceMinor: 1234n,
        currency: "AED",
        supplierId: ids.supplierA,
        imageUrl: "/window.svg",
        imageStorageKey: "",
      },
    });
    productIds.push(product.id);
    await expect(
      removeProductImage(actor(ids.supplierA), product.id, storage),
    ).resolves.toEqual({ cleanupWarning: false });
    expect(storage.deletes).toEqual([]);
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ).resolves.toMatchObject({ imageUrl: "", imageStorageKey: "" });
  });

  it.each([
    [ids.customer, Role.CUSTOMER],
    [ids.disabled, Role.SUPPLIER],
  ])("reloads and rejects an unauthorized database actor", async (id, role) => {
    await expect(
      createProductWithImage(actor(id, role), input, image, new FakeStorage()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a session actor demoted in PostgreSQL", async () => {
    await prisma.user.update({
      where: { id: ids.supplierA },
      data: { role: Role.CUSTOMER },
    });
    await expect(
      createProductWithImage(
        actor(ids.supplierA),
        input,
        image,
        new FakeStorage(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.user.update({
      where: { id: ids.supplierA },
      data: { role: Role.SUPPLIER },
    });
  });

  it("allows exactly one of two concurrent replacements and compensates the loser", async () => {
    const setup = new FakeStorage();
    const product = await createProductWithImage(
      actor(ids.supplierA),
      { ...input, name: "Concurrent replacements" },
      image,
      setup,
    );
    productIds.push(product.id);
    const storage = new DeferredStorage();
    const operations = [
      trackOperation(
        "first concurrent replacement",
        updateProductWithImage(
          actor(ids.supplierA),
          product.id,
          { ...input, name: "Winner" },
          image,
          false,
          storage,
        ),
      ),
      trackOperation(
        "second concurrent replacement",
        updateProductWithImage(
          actor(ids.supplierA),
          product.id,
          { ...input, name: "Loser" },
          image,
          false,
          storage,
        ),
      ),
    ];
    try {
      await storage.waitForUploads(2);
      storage.resolveUpload(0, "11111111-1111-4111-8111-111111111111");
      const winner = await awaitSuccessfulOperation(operations[0]);
      storage.resolveUpload(1, "22222222-2222-4222-8222-222222222222");
      expect(await awaitOperationResult(operations[1])).toMatchObject({
        status: "rejected",
        error: { code: "CONFLICT" },
      });
      expect(storage.deletes).toEqual([
        product.imageStorageKey,
        "inventory-order/product-images/22222222-2222-4222-8222-222222222222",
      ]);
      expect(storage.deletes).not.toContain(winner.product.imageStorageKey);
      await expect(
        prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      ).resolves.toMatchObject({
        imageStorageKey: winner.product.imageStorageKey,
      });
    } finally {
      storage.abortPending();
      await settleOperations(operations);
    }
  });

  it("prevents a stale replacement from overwriting a concurrent removal", async () => {
    const setup = new FakeStorage();
    const product = await createProductWithImage(
      actor(ids.supplierA),
      { ...input, name: "Replacement removal race" },
      image,
      setup,
    );
    productIds.push(product.id);
    const storage = new DeferredStorage();
    const operation = trackOperation(
      "removal-first stale replacement",
      updateProductWithImage(
        actor(ids.supplierA),
        product.id,
        input,
        image,
        false,
        storage,
      ),
    );
    let removal: TrackedOperation<unknown> | undefined;
    try {
      await storage.waitForUploads(1);
      removal = trackOperation(
        "removal-first winner",
        removeProductImage(actor(ids.supplierA), product.id, storage),
      );
      await awaitSuccessfulOperation(removal);
      storage.resolveUpload(0, "33333333-3333-4333-8333-333333333333");
      expect(await awaitOperationResult(operation)).toMatchObject({
        status: "rejected",
        error: { code: "CONFLICT" },
      });
      expect(storage.deletes).toEqual([
        product.imageStorageKey,
        "inventory-order/product-images/33333333-3333-4333-8333-333333333333",
      ]);
    } finally {
      storage.abortPending();
      await settleOperations([operation, ...(removal ? [removal] : [])]);
    }
  });

  it("prevents stale removal from clearing a replacement that committed first", async () => {
    const setup = new FakeStorage();
    const product = await createProductWithImage(
      actor(ids.supplierA),
      { ...input, name: "Replacement first stale removal" },
      image,
      setup,
    );
    productIds.push(product.id);
    const storage = new DeferredStorage();
    const removalGate = new DeferredGate("stale removal snapshot barrier");
    const replacement = trackOperation(
      "replacement-first winner",
      updateProductWithImage(
        actor(ids.supplierA),
        product.id,
        input,
        image,
        false,
        storage,
      ),
    );
    let removal: TrackedOperation<unknown> | undefined;
    try {
      await storage.waitForUploads(1);
      removal = trackOperation(
        "stale removal loser",
        removeProductImage(actor(ids.supplierA), product.id, storage, {
          afterSnapshot: () => removalGate.block(),
        }),
      );
      await removalGate.waitUntilReached();
      storage.resolveUpload(0, "66666666-6666-4666-8666-666666666666");
      const winner = await awaitSuccessfulOperation(replacement);
      removalGate.release();
      expect(await awaitOperationResult(removal)).toMatchObject({
        status: "rejected",
        error: { code: "CONFLICT" },
      });
      const persisted = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(persisted.imageStorageKey).toBe(winner.product.imageStorageKey);
      expect(storage.deletes).toEqual([product.imageStorageKey]);
      expect(storage.deletes).not.toContain(winner.product.imageStorageKey);
    } finally {
      removalGate.release();
      storage.abortPending();
      await settleOperations([replacement, ...(removal ? [removal] : [])]);
    }
  });

  it("conflicts and compensates when archival wins before replacement", async () => {
    const setup = new FakeStorage();
    const product = await createProductWithImage(
      actor(ids.supplierA),
      { ...input, name: "Archive wins" },
      image,
      setup,
    );
    productIds.push(product.id);
    const storage = new DeferredStorage();
    const operation = trackOperation(
      "archive-first stale replacement",
      updateProductWithImage(
        actor(ids.supplierA),
        product.id,
        input,
        image,
        false,
        storage,
      ),
    );
    let archive: TrackedOperation<unknown> | undefined;
    try {
      await storage.waitForUploads(1);
      archive = trackOperation(
        "archive-first winner",
        archiveProduct(actor(ids.supplierA), product.id),
      );
      await awaitSuccessfulOperation(archive);
      storage.resolveUpload(0, "44444444-4444-4444-8444-444444444444");
      expect(await awaitOperationResult(operation)).toMatchObject({
        status: "rejected",
        error: { code: "CONFLICT" },
      });
      expect(storage.deletes).toEqual([
        "inventory-order/product-images/44444444-4444-4444-8444-444444444444",
      ]);
      await expect(
        prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      ).resolves.toMatchObject({
        archivedAt: expect.any(Date),
        imageStorageKey: product.imageStorageKey,
      });
    } finally {
      storage.abortPending();
      await settleOperations([operation, ...(archive ? [archive] : [])]);
    }
  });

  it("allows replacement-first archival to retain the winning image", async () => {
    const setup = new FakeStorage();
    const product = await createProductWithImage(
      actor(ids.supplierA),
      { ...input, name: "Replacement wins" },
      image,
      setup,
    );
    productIds.push(product.id);
    const storage = new DeferredStorage();
    const operation = trackOperation(
      "replacement-first archive",
      updateProductWithImage(
        actor(ids.supplierA),
        product.id,
        input,
        image,
        false,
        storage,
      ),
    );
    let archive: TrackedOperation<unknown> | undefined;
    try {
      await storage.waitForUploads(1);
      storage.resolveUpload(0, "55555555-5555-4555-8555-555555555555");
      const winner = await awaitSuccessfulOperation(operation);
      archive = trackOperation(
        "replacement-first archive",
        archiveProduct(actor(ids.supplierA), product.id),
      );
      await awaitSuccessfulOperation(archive);
      await expect(
        prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      ).resolves.toMatchObject({
        archivedAt: expect.any(Date),
        imageStorageKey: winner.product.imageStorageKey,
      });
      expect(storage.deletes).toEqual([product.imageStorageKey]);
    } finally {
      storage.abortPending();
      await settleOperations([operation, ...(archive ? [archive] : [])]);
    }
  });
});
