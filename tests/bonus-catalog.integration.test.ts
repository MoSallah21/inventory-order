import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  listPublicProductOptions,
  listPublicProductsPage,
  parsePublicProductFilters,
} from "@/modules/catalog/service";

const run = `bonus-catalog-${randomUUID()}`;
const marker = `Audit-${randomUUID()}`;
const ids = {
  supplierA: `${run}-supplier-a`,
  supplierB: `${run}-supplier-b`,
  disabledSupplier: `${run}-supplier-disabled`,
  categoryA: `${run}-category-a`,
  categoryB: `${run}-category-b`,
  archivedCategory: `${run}-category-archived`,
};
const mainProductIds = Array.from(
  { length: 11 },
  (_, index) => `${run}-product-${String(index).padStart(2, "0")}`,
);
const excludedProductIds = [
  `${run}-product-archived`,
  `${run}-product-archived-category`,
  `${run}-product-disabled-supplier`,
];
const productIds = [...mainProductIds, ...excludedProductIds];
const createdAt = new Date("2026-06-01T12:00:00.000Z");

async function cleanup() {
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.deleteMany({
    where: {
      id: { in: [ids.categoryA, ids.categoryB, ids.archivedCategory] },
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: { in: [ids.supplierA, ids.supplierB, ids.disabledSupplier] },
    },
  });
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ids.supplierA,
        name: `${marker} Supplier A`,
        email: `${ids.supplierA}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.supplierB,
        name: `${marker} Supplier B`,
        email: `${ids.supplierB}@example.test`,
        role: Role.SUPPLIER,
      },
      {
        id: ids.disabledSupplier,
        name: `${marker} Disabled Supplier`,
        email: `${ids.disabledSupplier}@example.test`,
        role: Role.SUPPLIER,
        disabledAt: new Date(),
      },
    ],
  });
  await prisma.category.createMany({
    data: [
      { id: ids.categoryA, name: `${marker} Category A`, slug: ids.categoryA },
      { id: ids.categoryB, name: `${marker} Category B`, slug: ids.categoryB },
      {
        id: ids.archivedCategory,
        name: `${marker} Archived Category`,
        slug: ids.archivedCategory,
        archivedAt: new Date(),
      },
    ],
  });
  await prisma.product.createMany({
    data: [
      ...mainProductIds.map((id, index) => ({
        id,
        supplierId: index === 10 ? ids.supplierB : ids.supplierA,
        categoryId: index === 10 ? ids.categoryB : ids.categoryA,
        name: `${marker} Widget ${String(index).padStart(2, "0")}`,
        description: `Test product ${index}`,
        priceMinor: BigInt(100 + index),
        currency: "AED",
        stockQuantity: index === 0 ? 0 : index + 1,
        imageUrl: "/window.svg",
        imageStorageKey: "",
        createdAt,
      })),
      {
        id: excludedProductIds[0],
        supplierId: ids.supplierA,
        categoryId: ids.categoryA,
        name: `${marker} Archived Product`,
        description: "Excluded archived product",
        priceMinor: 105n,
        stockQuantity: 1,
        imageUrl: "/window.svg",
        imageStorageKey: "",
        archivedAt: new Date(),
        createdAt,
      },
      {
        id: excludedProductIds[1],
        supplierId: ids.supplierA,
        categoryId: ids.archivedCategory,
        name: `${marker} Archived Category Product`,
        description: "Excluded category product",
        priceMinor: 105n,
        stockQuantity: 1,
        imageUrl: "/window.svg",
        imageStorageKey: "",
        createdAt,
      },
      {
        id: excludedProductIds[2],
        supplierId: ids.disabledSupplier,
        categoryId: ids.categoryA,
        name: `${marker} Disabled Supplier Product`,
        description: "Excluded supplier product",
        priceMinor: 105n,
        stockQuantity: 1,
        imageUrl: "/window.svg",
        imageStorageKey: "",
        createdAt,
      },
    ],
  });
});

afterAll(cleanup);

describe("bonus catalog production queries", () => {
  it("applies case-insensitive, category, supplier, stock, exact price, and combined filters", async () => {
    const searched = await listPublicProductsPage(
      { q: marker.toLowerCase() },
      1,
    );
    expect(searched.totalCount).toBe(11);
    expect(
      searched.products.every((product) => mainProductIds.includes(product.id)),
    ).toBe(true);

    const combined = await listPublicProductsPage(
      {
        q: marker.toUpperCase(),
        category: ids.categoryA,
        supplier: ids.supplierA,
        minPrice: "1.05",
        maxPrice: "1.07",
        inStock: "true",
      },
      1,
    );
    expect(combined.totalCount).toBe(3);
    expect(
      combined.products.map((product) => product.priceMinor).sort(),
    ).toEqual(["105", "106", "107"]);

    const category = await listPublicProductsPage(
      { q: marker, category: ids.categoryB },
      1,
    );
    expect(category.products.map((product) => product.id)).toEqual([
      mainProductIds[10],
    ]);

    const supplier = await listPublicProductsPage(
      { q: marker, supplier: ids.supplierB },
      1,
    );
    expect(supplier.products.map((product) => product.id)).toEqual([
      mainProductIds[10],
    ]);

    const inStock = await listPublicProductsPage(
      { q: marker, inStock: "true" },
      1,
    );
    expect(inStock.totalCount).toBe(10);
    expect(inStock.products.map((product) => product.id)).not.toContain(
      mainProductIds[0],
    );
  });

  it("excludes non-public products and exposes only public filter options", async () => {
    const archived = await listPublicProductsPage(
      { q: `${marker} Archived Product` },
      1,
    );
    const archivedCategory = await listPublicProductsPage(
      { q: marker, category: ids.archivedCategory },
      1,
    );
    const disabledSupplier = await listPublicProductsPage(
      { q: marker, supplier: ids.disabledSupplier },
      1,
    );
    expect(archived.totalCount).toBe(0);
    expect(archivedCategory.totalCount).toBe(0);
    expect(disabledSupplier.totalCount).toBe(0);

    const options = await listPublicProductOptions();
    const categoryIds = options.categories.map((category) => category.slug);
    const supplierIds = options.suppliers.map((supplier) => supplier.id);
    expect(categoryIds).toEqual(
      expect.arrayContaining([ids.categoryA, ids.categoryB]),
    );
    expect(categoryIds).not.toContain(ids.archivedCategory);
    expect(supplierIds).toEqual(
      expect.arrayContaining([ids.supplierA, ids.supplierB]),
    );
    expect(supplierIds).not.toContain(ids.disabledSupplier);
  });

  it("returns only the exact public DTO allow-list", async () => {
    const result = await listPublicProductsPage(
      { q: marker, supplier: ids.supplierB },
      1,
    );
    expect(Object.keys(result.products[0]).sort()).toEqual(
      [
        "category",
        "currency",
        "description",
        "formattedPrice",
        "id",
        "imageUrl",
        "name",
        "priceMinor",
        "stockQuantity",
        "supplierName",
      ].sort(),
    );
  });

  it("paginates exactly ten and eleven rows with stable unique ordering", async () => {
    const ten = await listPublicProductsPage(
      { q: marker, maxPrice: "1.09" },
      1,
    );
    expect(ten).toMatchObject({ totalCount: 10, page: 1, pageCount: 1 });

    const first = await listPublicProductsPage({ q: marker }, 1);
    const second = await listPublicProductsPage({ q: marker }, 2);
    const expected = [...mainProductIds].sort().reverse();
    expect(first).toMatchObject({ totalCount: 11, page: 1, pageCount: 2 });
    expect(second).toMatchObject({ totalCount: 11, page: 2, pageCount: 2 });
    expect([
      ...first.products.map((product) => product.id),
      ...second.products.map((product) => product.id),
    ]).toEqual(expected);
    expect(
      new Set([
        ...first.products.map((product) => product.id),
        ...second.products.map((product) => product.id),
      ]).size,
    ).toBe(11);

    const clamped = await listPublicProductsPage({ q: marker }, 999);
    expect(clamped.page).toBe(2);
    expect(clamped.products.map((product) => product.id)).toEqual([
      expected[10],
    ]);
  });

  it("keeps malformed and repeated URL values on the production parser path", () => {
    expect(parsePublicProductFilters({ minPrice: "1e2" }).error).toMatch(
      /non-negative/,
    );
    expect(
      parsePublicProductFilters({ minPrice: ["1.00", "2.00"] }),
    ).toMatchObject({ minPrice: "", minPriceMinor: undefined });
    expect(
      parsePublicProductFilters({ minPrice: "2.00", maxPrice: "1.00" }).error,
    ).toMatch(/cannot exceed/);
  });
});
