import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/enums";
import type { Actor } from "@/modules/auth/authorization";

const mocks = vi.hoisted(() => ({
  listPublicProductsPage: vi.fn(),
  listOrdersPage: vi.fn(),
  requireProtectedPage: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/components/add-to-cart", () => ({ AddToCart: () => null }));
vi.mock("@/components/public-navigation", () => ({
  PublicNavigation: () => null,
}));
vi.mock("@/components/authenticated-navigation", () => ({
  AuthenticatedNavigation: () => null,
}));
vi.mock("@/modules/catalog/service", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules/catalog/service")>();
  return { ...original, listPublicProductsPage: mocks.listPublicProductsPage };
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
import ProductsPage from "@/app/products/page";

const actor = (role: Role): Actor => ({
  id: `page-${role}`,
  role,
  name: role,
  email: `${role.toLowerCase()}@example.test`,
  disabledAt: null,
});

beforeEach(() => vi.clearAllMocks());

describe("bonus rendered page behavior", () => {
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
        expect(html).toContain('href="/orders/export">Export orders CSV</a>');
      } else {
        expect(html).not.toContain("Export orders CSV");
        expect(html).not.toContain('href="/orders/export"');
      }
    },
  );
});
