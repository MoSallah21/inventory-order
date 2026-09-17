import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/enums";
import { categoryResetKey } from "@/modules/catalog/category-presentation";

const mocks = vi.hoisted(() => ({
  categoryManagement: vi.fn(),
  listCategories: vi.fn(),
  requireProtectedPage: vi.fn(),
}));

vi.mock("@/components/authenticated-navigation", () => ({
  AuthenticatedNavigation: () => null,
}));
vi.mock("@/components/category-management", () => ({
  CategoryManagement: (props: unknown) => {
    mocks.categoryManagement(props);
    return createElement("div", null, "Category management");
  },
}));
vi.mock("@/modules/auth/page-authorization", () => ({
  requireProtectedPage: mocks.requireProtectedPage,
}));
vi.mock("@/modules/catalog/service", () => ({
  listCategories: mocks.listCategories,
}));

import CategoriesPage from "@/app/admin/categories/page";

const baseCategory = {
  archived: false,
  archivedAt: null,
  description: "Office products",
  id: "category-1",
  name: "Office",
  slug: "office",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("category reset presentation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProtectedPage.mockResolvedValue({
      disabledAt: null,
      email: "admin@example.test",
      id: "admin-1",
      name: "Admin",
      role: Role.ADMIN,
    });
    mocks.listCategories.mockResolvedValue([
      {
        ...baseCategory,
        archivedAt: null,
        updatedAt: new Date(baseCategory.updatedAt),
      },
    ]);
  });

  it("keeps the callable helper in a neutral module and the page imports it there", async () => {
    const [pageSource, clientSource, neutralSource] = await Promise.all([
      readFile("src/app/admin/categories/page.tsx", "utf8"),
      readFile("src/components/category-management.tsx", "utf8"),
      readFile("src/modules/catalog/category-presentation.ts", "utf8"),
    ]);

    expect(pageSource).toContain(
      'import { categoryResetKey } from "@/modules/catalog/category-presentation"',
    );
    expect(pageSource).not.toMatch(
      /import\s*{[^}]*categoryResetKey[^}]*}\s*from\s*["']@\/components\/category-management["']/s,
    );
    expect(clientSource).toMatch(/^"use client";/);
    expect(clientSource).not.toContain("categoryResetKey");
    expect(neutralSource).not.toMatch(/["']use client["']/);
    expect(neutralSource).not.toMatch(
      /\b(window|document|navigator|localStorage)\b/,
    );
  });

  it("renders the real Server page without invoking a client export", async () => {
    const html = renderToStaticMarkup(
      await CategoriesPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Categories");
    expect(html).toContain("Category management");
    expect(mocks.requireProtectedPage).toHaveBeenCalledWith(Role.ADMIN);
    expect(mocks.listCategories).toHaveBeenCalledOnce();
  });

  it("is stable for identical trusted state and changes for every reset field", () => {
    const key = categoryResetKey([baseCategory]);
    expect(categoryResetKey([{ ...baseCategory }])).toBe(key);

    const changes = [
      { id: "category-2" },
      { name: "Office updated" },
      { slug: "office-updated" },
      { description: "Updated description" },
      { updatedAt: "2026-01-01T00:00:01.000Z" },
      {
        archived: true,
        archivedAt: "2026-01-01T00:00:02.000Z",
      },
    ];
    for (const change of changes) {
      expect(categoryResetKey([{ ...baseCategory, ...change }])).not.toBe(key);
    }

    const archived = { ...baseCategory, ...changes.at(-1)! };
    expect(
      categoryResetKey([{ ...archived, archived: false, archivedAt: null }]),
    ).not.toBe(categoryResetKey([archived]));
  });
});
