import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/enums";
import type { Actor } from "@/modules/auth/authorization";

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
  getPublicProduct: vi.fn(),
  listPublicProductsPage: vi.fn(),
  listOrdersPage: vi.fn(),
  requireProtectedPage: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/components/add-to-cart", () => ({
  AddToCart: ({
    productId,
    stockQuantity,
  }: {
    productId: string;
    stockQuantity: number;
  }) =>
    stockQuantity > 0
      ? createElement("button", { "data-product-id": productId }, "Add to cart")
      : createElement(
          "span",
          { className: "stock-unavailable" },
          "Out of stock — unavailable to add",
        ),
}));
vi.mock("@/components/public-navigation", () => ({
  PublicNavigation: () => null,
}));
vi.mock("@/components/authenticated-navigation", () => ({
  AuthenticatedNavigation: () => null,
}));
vi.mock("@/modules/catalog/service", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules/catalog/service")>();
  return {
    ...original,
    getPublicProduct: mocks.getPublicProduct,
    listPublicProductsPage: mocks.listPublicProductsPage,
  };
});
vi.mock("@/modules/auth/authorization", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules/auth/authorization")>();
  return { ...original, getCurrentActor: mocks.getCurrentActor };
});
vi.mock("@/modules/orders/service", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules/orders/service")>();
  return { ...original, listOrdersPage: mocks.listOrdersPage };
});
vi.mock("@/modules/auth/page-authorization", () => ({
  requireProtectedPage: mocks.requireProtectedPage,
}));

import OrdersPage from "@/app/orders/page";
import ProductDetailPage from "@/app/products/[productId]/page";
import ProductsPage from "@/app/products/page";

const actor = (role: Role): Actor => ({
  id: `page-${role}`,
  role,
  name: role,
  email: `${role.toLowerCase()}@example.test`,
  disabledAt: null,
});

const product = {
  id: "product-1",
  name: "Desk lamp",
  description: "A compact task light.",
  imageUrl: "https://example.test/lamp.jpg",
  category: { name: "Office" },
  supplierName: "Demo Supplier",
  formattedPrice: "AED 49.95",
  stockQuantity: 3,
};

function productPageResult(stockQuantity = product.stockQuantity) {
  return {
    products: [{ ...product, stockQuantity }],
    filters: {
      q: "",
      category: "",
      supplier: "",
      minPrice: "",
      maxPrice: "",
      inStock: false,
    },
    options: { categories: [], suppliers: [] },
    page: 1,
    pageCount: 1,
    totalCount: 1,
    pageSize: 10,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentActor.mockResolvedValue(null);
});

describe("bonus rendered page behavior", () => {
  it.each([
    [Role.CUSTOMER, true],
    [Role.ADMIN, false],
    [Role.SUPPLIER, false],
  ])(
    "renders role-aware product purchase controls for %s",
    async (role, canPurchase) => {
      mocks.getCurrentActor.mockResolvedValue(actor(role));
      mocks.listPublicProductsPage.mockResolvedValue(productPageResult());
      mocks.getPublicProduct.mockResolvedValue(product);

      const listHtml = renderToStaticMarkup(
        await ProductsPage({ searchParams: Promise.resolve({}) }),
      );
      const detailHtml = renderToStaticMarkup(
        await ProductDetailPage({
          params: Promise.resolve({ productId: product.id }),
        }),
      );

      for (const html of [listHtml, detailHtml]) {
        expect(html.includes("Add to cart")).toBe(canPurchase);
        expect(html).not.toContain("Sign in as Customer to purchase");
      }
    },
  );

  it("renders anonymous sign-in guidance without a functional cart control", async () => {
    mocks.listPublicProductsPage.mockResolvedValue(productPageResult());
    mocks.getPublicProduct.mockResolvedValue(product);

    const listHtml = renderToStaticMarkup(
      await ProductsPage({ searchParams: Promise.resolve({}) }),
    );
    const detailHtml = renderToStaticMarkup(
      await ProductDetailPage({
        params: Promise.resolve({ productId: product.id }),
      }),
    );

    for (const html of [listHtml, detailHtml]) {
      expect(html).not.toContain("Add to cart");
      expect(html).toContain('href="/sign-in"');
      expect(html).toContain("Sign in as Customer to purchase");
    }
  });

  it("renders out-of-stock products without an active purchase button", async () => {
    mocks.getCurrentActor.mockResolvedValue(actor(Role.CUSTOMER));
    mocks.listPublicProductsPage.mockResolvedValue(productPageResult(0));
    mocks.getPublicProduct.mockResolvedValue({ ...product, stockQuantity: 0 });

    const listHtml = renderToStaticMarkup(
      await ProductsPage({ searchParams: Promise.resolve({}) }),
    );
    const detailHtml = renderToStaticMarkup(
      await ProductDetailPage({
        params: Promise.resolve({ productId: product.id }),
      }),
    );

    for (const html of [listHtml, detailHtml]) {
      expect(html).not.toContain("Add to cart");
      expect(html).toContain("Out of stock — unavailable to add");
    }
  });

  it("uses the shared bounded product image and card structure", async () => {
    mocks.listPublicProductsPage.mockResolvedValue(productPageResult());
    mocks.getPublicProduct.mockResolvedValue(product);
    const listHtml = renderToStaticMarkup(
      await ProductsPage({ searchParams: Promise.resolve({}) }),
    );
    const detailHtml = renderToStaticMarkup(
      await ProductDetailPage({
        params: Promise.resolve({ productId: product.id }),
      }),
    );

    expect(listHtml).toContain('class="catalog-grid"');
    expect(listHtml).toContain('class="product-card"');
    expect(listHtml).toContain('class="product-image"');
    expect(detailHtml).toContain('class="product-image"');
  });

  it("preserves every product filter in paging links and renders reset states", async () => {
    mocks.listPublicProductsPage.mockResolvedValue({
      products: [],
      filters: {
        q: "widget",
        category: "office",
        supplier: "supplier-1",
        minPrice: "1.00",
        maxPrice: "9.99",
        inStock: true,
      },
      options: { categories: [], suppliers: [] },
      page: 2,
      pageCount: 3,
      totalCount: 21,
      pageSize: 10,
    });
    const query = {
      q: "widget",
      category: "office",
      supplier: "supplier-1",
      minPrice: "1.00",
      maxPrice: "9.99",
      inStock: "true",
      page: "2",
    };
    const html = renderToStaticMarkup(
      await ProductsPage({ searchParams: Promise.resolve(query) }),
    );
    const common =
      "q=widget&amp;category=office&amp;supplier=supplier-1&amp;minPrice=1.00&amp;maxPrice=9.99&amp;inStock=true";
    expect(html).toContain(`href="/products?${common}"`);
    expect(html).toContain(`href="/products?${common}&amp;page=3"`);
    expect(html).toContain("Page 2 of 3 · 21 products");
    expect(html).toContain("No products match these filters.");
    expect(html).toContain('href="/products">Reset filters</a>');
  });

  it.each([Role.ADMIN, Role.CUSTOMER, Role.SUPPLIER])(
    "renders role-correct export visibility and order paging for %s",
    async (role) => {
      mocks.requireProtectedPage.mockResolvedValue(actor(role));
      mocks.listOrdersPage.mockResolvedValue({
        orders: [],
        page: 2,
        pageCount: 3,
        totalCount: 21,
        pageSize: 10,
      });
      const html = renderToStaticMarkup(
        await OrdersPage({
          searchParams: Promise.resolve({ placed: "yes", page: "2" }),
        }),
      );
      expect(html).toContain("Page 2 of 3 · 21 orders");
      expect(html).toContain('href="/orders?placed=yes">Previous</a>');
      expect(html).toContain('href="/orders?placed=yes&amp;page=3">Next</a>');
      if (role === Role.ADMIN) {
        expect(html.indexOf("Export orders CSV")).toBeLessThan(
          html.indexOf("Page 2 of 3"),
        );
        expect(html).toContain('href="/orders/export">Export orders CSV</a>');
      } else {
        expect(html).not.toContain("Export orders CSV");
        expect(html).not.toContain('href="/orders/export"');
      }
    },
  );
});
