import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  create: vi.fn(),
  requireRole: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/modules/auth/authorization", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@/modules/catalog/service", () => ({
  archiveCategory: mocks.archive,
  createCategory: mocks.create,
  restoreCategory: mocks.restore,
  updateCategory: vi.fn(),
}));

import {
  archiveCategoryAction,
  createCategoryAction,
  restoreCategoryAction,
} from "@/app/admin/categories/actions";
import { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ id: "admin", role: Role.ADMIN });
});

describe("category state actions", () => {
  it("keeps the create payload and Admin boundary while identifying safe create errors", async () => {
    const data = new FormData();
    data.set("name", "Office Supplies");
    data.set("slug", "office-supplies");
    data.set("description", "Office products");
    mocks.create.mockRejectedValueOnce(
      new AppError("VALIDATION_FAILED", "Invalid category.", {
        slug: ["Use lowercase letters, numbers, and hyphens."],
      }),
    );

    await expect(createCategoryAction(data)).rejects.toThrow(
      "REDIRECT:/admin/categories?error=Use+lowercase+letters%2C+numbers%2C+and+hyphens.&create=1",
    );
    expect(mocks.requireRole).toHaveBeenCalledWith(Role.ADMIN);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.ADMIN }),
      {
        description: "Office products",
        name: "Office Supplies",
        slug: "office-supplies",
      },
    );
  });

  it("does not disclose unexpected creation failures", async () => {
    mocks.create.mockRejectedValueOnce(new Error("database details"));

    await expect(createCategoryAction(new FormData())).rejects.toThrow(
      "REDIRECT:/admin/categories?error=An+unexpected+error+occurred.&create=1",
    );
  });

  it("archives through the existing Admin-authorized id contract", async () => {
    const data = new FormData();
    data.set("id", "category-1");

    await expect(archiveCategoryAction(data)).rejects.toThrow(
      "REDIRECT:/admin/categories?saved=1",
    );
    expect(mocks.requireRole).toHaveBeenCalledWith(Role.ADMIN);
    expect(mocks.archive).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.ADMIN }),
      "category-1",
    );
  });

  it("restores through the same Admin-authorized id contract", async () => {
    const data = new FormData();
    data.set("id", "category-1");

    await expect(restoreCategoryAction(data)).rejects.toThrow(
      "REDIRECT:/admin/categories?saved=1",
    );
    expect(mocks.requireRole).toHaveBeenCalledWith(Role.ADMIN);
    expect(mocks.restore).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.ADMIN }),
      "category-1",
    );
  });
});
