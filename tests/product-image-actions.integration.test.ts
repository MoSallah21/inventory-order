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
import { genuineProductImages } from "./fixtures/product-images";

const mocks = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  uploadCalls: [] as string[],
  deleteCalls: [] as string[],
  secureUrl: "default" as unknown,
  returnedPublicId: null as string | null,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/modules/auth/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        mocks.sessionUserId ? { user: { id: mocks.sessionUserId } } : null,
    },
  },
}));
vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: (
        options: { public_id: string; format: string },
        callback: (error: null, response: object) => void,
      ) => ({
        end: () => {
          mocks.uploadCalls.push(options.public_id);
          const secureUrl =
            mocks.secureUrl === "default"
              ? `https://res.cloudinary.com/action-test/image/upload/v1/${options.public_id}.${options.format}`
              : mocks.secureUrl;
          callback(null, {
            public_id: mocks.returnedPublicId ?? options.public_id,
            ...(mocks.secureUrl === "absent" ? {} : { secure_url: secureUrl }),
            resource_type: "image",
            format: options.format,
            bytes: genuineProductImages.png.length,
            width: 3,
            height: 2,
          });
        },
      }),
      destroy: async (key: string) => {
        mocks.deleteCalls.push(key);
        return { result: "ok" };
      },
    },
  },
}));

const previousCloudinary = {
  name: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET,
};
process.env.CLOUDINARY_CLOUD_NAME = "action-test";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";

import {
  createProductAction,
  updateProductAction,
} from "@/app/supplier/products/actions";
import { authorizeProductImageMutation } from "@/modules/catalog/service";

const run = `image-action-test-${randomUUID()}`;
const ids = {
  supplier: `${run}-supplier`,
  otherSupplier: `${run}-other-supplier`,
  disabled: `${run}-disabled`,
  customer: `${run}-customer`,
  admin: `${run}-admin`,
  demoted: `${run}-demoted`,
  category: `${run}-category`,
  otherProduct: `${run}-other-product`,
  ownedProduct: `${run}-owned-product`,
};
const createdProductIds: string[] = [ids.otherProduct, ids.ownedProduct];

class TrackingFile extends File {
  reads = 0;
  override async arrayBuffer() {
    this.reads += 1;
    return super.arrayBuffer();
  }
}

function form(file?: File, updateId?: string) {
  const data = new FormData();
  if (updateId) data.set("id", updateId);
  data.set("name", "Action product");
  data.set("description", "Database-backed action authorization test.");
  data.set("categoryId", ids.category);
  data.set("price", "1.00");
  data.set("stockQuantity", "1");
  if (file) data.set("image", file);
  data.set("supplierId", ids.otherSupplier);
  data.set("imageUrl", "https://attacker.test/image.png");
  data.set("imageStorageKey", "attacker/key");
  data.set("previousImageStorageKey", "attacker/previous-key");
  data.set("publicId", "attacker/public-id");
  data.set("previousImageUrl", "https://attacker.test/previous.png");
  return data;
}

function trackedPng() {
  return new TrackingFile([genuineProductImages.png], "product.png", {
    type: "image/png",
  });
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ids.supplier,
        name: "Supplier",
        email: `${ids.supplier}@test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.otherSupplier,
        name: "Other",
        email: `${ids.otherSupplier}@test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.disabled,
        name: "Disabled",
        email: `${ids.disabled}@test`,
        role: Role.SUPPLIER,
        disabledAt: new Date(),
      },
      {
        id: ids.customer,
        name: "Customer",
        email: `${ids.customer}@test`,
        role: Role.CUSTOMER,
      },
      {
        id: ids.admin,
        name: "Admin",
        email: `${ids.admin}@test`,
        role: Role.ADMIN,
      },
      {
        id: ids.demoted,
        name: "Demoted",
        email: `${ids.demoted}@test`,
        role: Role.CUSTOMER,
      },
    ],
  });
  await prisma.category.create({
    data: { id: ids.category, name: "Action images", slug: ids.category },
  });
  await prisma.product.createMany({
    data: [
      {
        id: ids.otherProduct,
        supplierId: ids.otherSupplier,
        categoryId: ids.category,
        name: "Other product",
        description: "Owned by another supplier.",
        priceMinor: 100n,
        stockQuantity: 1,
        imageUrl: "https://example.test/legacy.png",
        imageStorageKey: "external:https://example.test/legacy.png",
      },
      {
        id: ids.ownedProduct,
        supplierId: ids.supplier,
        categoryId: ids.category,
        name: "Owned product",
        description: "Owned product with trusted previous metadata.",
        priceMinor: 100n,
        stockQuantity: 1,
        imageUrl:
          "https://res.cloudinary.com/action-test/image/upload/inventory-order/product-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
        imageStorageKey:
          "inventory-order/product-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    ],
  });
});

afterAll(async () => {
  const exactProducts = await prisma.product.findMany({
    where: { categoryId: ids.category },
    select: { id: true },
  });
  await prisma.product.deleteMany({
    where: { id: { in: exactProducts.map(({ id }) => id) } },
  });
  await prisma.category.delete({ where: { id: ids.category } });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          ids.supplier,
          ids.otherSupplier,
          ids.disabled,
          ids.customer,
          ids.admin,
          ids.demoted,
        ],
      },
    },
  });
  if (previousCloudinary.name === undefined)
    delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = previousCloudinary.name;
  if (previousCloudinary.key === undefined)
    delete process.env.CLOUDINARY_API_KEY;
  else process.env.CLOUDINARY_API_KEY = previousCloudinary.key;
  if (previousCloudinary.secret === undefined)
    delete process.env.CLOUDINARY_API_SECRET;
  else process.env.CLOUDINARY_API_SECRET = previousCloudinary.secret;
});

beforeEach(() => {
  mocks.sessionUserId = null;
  mocks.uploadCalls.length = 0;
  mocks.deleteCalls.length = 0;
  mocks.secureUrl = "default";
  mocks.returnedPublicId = null;
});

describe("database-backed product image action authorization", () => {
  it.each([
    ["anonymous", null],
    ["customer", ids.customer],
    ["admin", ids.admin],
    ["disabled supplier", ids.disabled],
    ["database-demoted supplier", ids.demoted],
  ])("rejects %s before reading or uploading", async (_name, userId) => {
    mocks.sessionUserId = userId;
    const image = trackedPng();
    await expect(createProductAction(form(image))).rejects.toThrow("REDIRECT:");
    expect(image.reads).toBe(0);
    expect(mocks.uploadCalls).toEqual([]);
  });

  it("rejects cross-supplier replacement before reading or provider use", async () => {
    mocks.sessionUserId = ids.supplier;
    const image = trackedPng();
    const data = form(image, ids.otherProduct);
    await expect(updateProductAction(data)).rejects.toThrow(
      `REDIRECT:/supplier/products/${ids.otherProduct}/edit?error=Product+not+found.`,
    );
    await expect(
      authorizeProductImageMutation(
        {
          id: ids.supplier,
          name: "Supplier",
          email: `${ids.supplier}@test`,
          role: Role.SUPPLIER,
          disabledAt: null,
        },
        ids.otherProduct,
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Product not found.",
    });
    expect(image.reads).toBe(0);
    expect(mocks.uploadCalls).toEqual([]);
    expect(mocks.deleteCalls).toEqual([]);
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: ids.otherProduct } }),
    ).resolves.toMatchObject({
      imageUrl: "https://example.test/legacy.png",
      imageStorageKey: "external:https://example.test/legacy.png",
    });
  });

  it("rejects cross-supplier removal before parser or provider use", async () => {
    mocks.sessionUserId = ids.supplier;
    const data = form(undefined, ids.otherProduct);
    data.set("removeImage", "on");
    await expect(updateProductAction(data)).rejects.toThrow(
      `REDIRECT:/supplier/products/${ids.otherProduct}/edit?error=Product+not+found.`,
    );
    await expect(
      authorizeProductImageMutation(
        {
          id: ids.supplier,
          name: "Supplier",
          email: `${ids.supplier}@test`,
          role: Role.SUPPLIER,
          disabledAt: null,
        },
        ids.otherProduct,
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Product not found.",
    });
    expect(mocks.uploadCalls).toEqual([]);
    expect(mocks.deleteCalls).toEqual([]);
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: ids.otherProduct } }),
    ).resolves.toMatchObject({
      imageUrl: "https://example.test/legacy.png",
      imageStorageKey: "external:https://example.test/legacy.png",
    });
  });

  it.each([
    ["absent", "absent"],
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace-only", "   "],
    ["non-string", 123],
  ])(
    "rejects a %s secure_url, compensates only the generated key, and does not persist",
    async (_name, secureUrl) => {
      mocks.sessionUserId = ids.supplier;
      mocks.secureUrl = secureUrl;
      mocks.returnedPublicId =
        "inventory-order/product-images/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const before = await prisma.product.count({
        where: { categoryId: ids.category },
      });

      await expect(createProductAction(form(trackedPng()))).rejects.toThrow(
        "REDIRECT:/supplier/products/new?error=Image+storage+returned+an+invalid+response.",
      );

      expect(mocks.uploadCalls).toHaveLength(1);
      expect(mocks.deleteCalls).toEqual([mocks.uploadCalls[0]]);
      expect(mocks.deleteCalls).not.toContain(mocks.returnedPublicId);
      await expect(
        prisma.product.count({ where: { categoryId: ids.category } }),
      ).resolves.toBe(before);
    },
  );

  it("uses only database-trusted previous metadata during owner replacement", async () => {
    mocks.sessionUserId = ids.supplier;
    const image = trackedPng();
    await expect(
      updateProductAction(form(image, ids.ownedProduct)),
    ).rejects.toThrow("REDIRECT:");
    expect(image.reads).toBe(1);
    expect(mocks.uploadCalls).toHaveLength(1);
    expect(mocks.deleteCalls).toEqual([
      "inventory-order/product-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: ids.ownedProduct },
    });
    expect(product.supplierId).toBe(ids.supplier);
    expect(product.imageStorageKey).toBe(mocks.uploadCalls[0]);
    expect(product.imageUrl).toContain(mocks.uploadCalls[0]);
    expect(product.supplierId).not.toContain("attacker");
    expect(product.imageUrl).not.toContain("attacker");
    expect(product.imageStorageKey).not.toContain("attacker");
    expect(mocks.deleteCalls).not.toContain("attacker/previous-key");
    expect(mocks.deleteCalls).not.toContain("attacker/public-id");
  });

  it("lets the owning database supplier reach parsing/provider and ignores injected authority", async () => {
    mocks.sessionUserId = ids.supplier;
    const image = trackedPng();
    await expect(createProductAction(form(image))).rejects.toThrow("REDIRECT:");
    expect(image.reads).toBe(1);
    expect(mocks.uploadCalls).toHaveLength(1);
    const product = await prisma.product.findFirstOrThrow({
      where: { supplierId: ids.supplier, name: "Action product" },
    });
    createdProductIds.push(product.id);
    expect(product.supplierId).toBe(ids.supplier);
    expect(product.imageUrl).not.toContain("attacker.test");
    expect(product.imageStorageKey).not.toBe("attacker/key");
  });
});
