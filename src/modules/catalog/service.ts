import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatMinorUnits } from "@/lib/money";
import {
  assertActorRole,
  assertAuthenticatedActor,
  type Actor,
} from "@/modules/auth/authorization";
import { STOCK_MAX } from "@/modules/catalog/stock";

const CATEGORY_NAME_MAX = 80;
const PRODUCT_NAME_MAX = 120;
const PRODUCT_DESCRIPTION_MAX = 2_000;
const PRICE_MAX_MINOR = 999_999_999n;

export type CategoryInput = {
  name: string;
  slug: string;
  description?: string | null;
};

export type ProductInput = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  stockQuantity: number;
  imageUrl: string;
};

function requireActorRole(actor: Actor, role: Role) {
  return assertActorRole(assertAuthenticatedActor(actor), [role]);
}

function validationError(field: string, message: string): never {
  throw new AppError("VALIDATION_FAILED", "Please correct the form.", {
    [field]: [message],
  });
}

function normalizeCategoryInput(input: CategoryInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const slug = input.slug.trim().toLowerCase();
  const description = input.description?.trim() || null;

  if (!name || name.length > CATEGORY_NAME_MAX) {
    validationError("name", `Name must be 1-${CATEGORY_NAME_MAX} characters.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    validationError(
      "slug",
      "Use up to 80 lowercase letters, numbers, and hyphens.",
    );
  }
  if (description && description.length > 500) {
    validationError(
      "description",
      "Description must be at most 500 characters.",
    );
  }
  return { name, slug, description };
}

export function parseAedPrice(value: string): bigint {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    validationError(
      "price",
      "Enter a non-negative AED amount with at most two decimals.",
    );
  }
  const [major, fraction = ""] = normalized.split(".");
  const amount = BigInt(major) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > PRICE_MAX_MINOR) {
    validationError("price", "Price is above the supported maximum.");
  }
  return amount;
}

function normalizeProductInput(input: ProductInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const description = input.description.trim();
  const categoryId = input.categoryId.trim();
  const imageUrl = input.imageUrl.trim();

  if (!name || name.length > PRODUCT_NAME_MAX) {
    validationError("name", `Name must be 1-${PRODUCT_NAME_MAX} characters.`);
  }
  if (!description || description.length > PRODUCT_DESCRIPTION_MAX) {
    validationError(
      "description",
      `Description must be 1-${PRODUCT_DESCRIPTION_MAX} characters.`,
    );
  }
  if (!categoryId) validationError("categoryId", "Choose a category.");
  if (
    !Number.isSafeInteger(input.stockQuantity) ||
    input.stockQuantity < 0 ||
    input.stockQuantity > STOCK_MAX
  ) {
    validationError(
      "stockQuantity",
      `Stock must be an integer from 0-${STOCK_MAX}.`,
    );
  }
  try {
    if (new URL(imageUrl).protocol !== "https:") throw new Error();
  } catch {
    validationError("imageUrl", "Enter a valid HTTPS image URL.");
  }

  return {
    name,
    description,
    categoryId,
    priceMinor: parseAedPrice(input.price),
    stockQuantity: input.stockQuantity,
    imageUrl,
    imageStorageKey: `external:${imageUrl}`,
  };
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new AppError("CONFLICT", "That unique value is already in use.");
    }
    if (error.code === "P2025") {
      throw new AppError("NOT_FOUND", "The requested record was not found.");
    }
  }
  throw error;
}

type TransactionClient = Prisma.TransactionClient;

type LockedCategory = { id: string; archivedAt: Date | null };

async function lockCategoryForUpdate(
  tx: TransactionClient,
  categoryId: string,
): Promise<LockedCategory> {
  const rows = await tx.$queryRaw<LockedCategory[]>(Prisma.sql`
    SELECT "id", "archivedAt"
    FROM "Category"
    WHERE "id" = ${categoryId}
    FOR UPDATE
  `);
  const category = rows[0];
  if (!category) {
    throw new AppError("NOT_FOUND", "Category not found.");
  }
  return category;
}

async function requireLockedActiveCategory(
  tx: TransactionClient,
  categoryId: string,
) {
  const category = await lockCategoryForUpdate(tx, categoryId);
  if (category.archivedAt) {
    throw new AppError("VALIDATION_FAILED", "Choose an active category.", {
      categoryId: ["The selected category is unavailable."],
    });
  }
  return category;
}

async function requireLockedSupplierProduct(
  tx: TransactionClient,
  supplierId: string,
  productId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "Product"
    WHERE "id" = ${productId} AND "supplierId" = ${supplierId}
    FOR UPDATE
  `);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Product not found.");
  return rows[0];
}

export async function listCategories(actor: Actor) {
  requireActorRole(actor, Role.ADMIN);
  return prisma.category.findMany({
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
  });
}

export async function listActiveCategories(actor: Actor) {
  requireActorRole(actor, Role.SUPPLIER);
  return prisma.category.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

export async function createCategory(actor: Actor, input: CategoryInput) {
  requireActorRole(actor, Role.ADMIN);
  try {
    return await prisma.category.create({
      data: normalizeCategoryInput(input),
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateCategory(
  actor: Actor,
  id: string,
  input: CategoryInput,
) {
  requireActorRole(actor, Role.ADMIN);
  try {
    return await prisma.category.update({
      where: { id },
      data: normalizeCategoryInput(input),
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function archiveCategory(actor: Actor, id: string) {
  requireActorRole(actor, Role.ADMIN);
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await lockCategoryForUpdate(tx, id);
      if (locked.archivedAt) {
        return tx.category.findUniqueOrThrow({ where: { id } });
      }
      return tx.category.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function listSupplierProducts(actor: Actor) {
  const supplier = requireActorRole(actor, Role.SUPPLIER);
  return prisma.product.findMany({
    where: { supplierId: supplier.id },
    include: { category: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSupplierProduct(actor: Actor, id: string) {
  const supplier = requireActorRole(actor, Role.SUPPLIER);
  const product = await prisma.product.findFirst({
    where: { id, supplierId: supplier.id },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found.");
  return product;
}

export async function createProduct(actor: Actor, input: ProductInput) {
  const supplier = requireActorRole(actor, Role.SUPPLIER);
  const data = normalizeProductInput(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await requireLockedActiveCategory(tx, data.categoryId);
      return tx.product.create({
        data: { ...data, currency: "AED", supplierId: supplier.id },
      });
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateProduct(
  actor: Actor,
  id: string,
  input: ProductInput,
) {
  const supplier = requireActorRole(actor, Role.SUPPLIER);
  const data = normalizeProductInput(input);
  try {
    return await prisma.$transaction(async (tx) => {
      // Deterministic order for updates: product row, then category row.
      await requireLockedSupplierProduct(tx, supplier.id, id);
      await requireLockedActiveCategory(tx, data.categoryId);
      return tx.product.update({ where: { id }, data });
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function archiveProduct(actor: Actor, id: string) {
  const supplier = requireActorRole(actor, Role.SUPPLIER);
  await getSupplierProduct(supplier, id);
  try {
    return await prisma.product.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

const publicProductSelect = {
  id: true,
  name: true,
  description: true,
  priceMinor: true,
  currency: true,
  stockQuantity: true,
  imageUrl: true,
  category: { select: { name: true, slug: true } },
  supplier: { select: { name: true } },
} satisfies Prisma.ProductSelect;

function toPublicProduct(
  product: Prisma.ProductGetPayload<{ select: typeof publicProductSelect }>,
) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    formattedPrice: formatMinorUnits(product.priceMinor, product.currency),
    stockQuantity: product.stockQuantity,
    imageUrl: product.imageUrl,
    category: product.category,
    supplierName: product.supplier.name,
  };
}

const publicWhere: Prisma.ProductWhereInput = {
  archivedAt: null,
  category: { archivedAt: null },
  supplier: { disabledAt: null, role: Role.SUPPLIER },
};

export async function listPublicProducts() {
  const products = await prisma.product.findMany({
    where: publicWhere,
    select: publicProductSelect,
    orderBy: { createdAt: "desc" },
  });
  return products.map(toPublicProduct);
}

export async function getPublicProduct(id: string) {
  const product = await prisma.product.findFirst({
    where: { ...publicWhere, id },
    select: publicProductSelect,
  });
  return product ? toPublicProduct(product) : null;
}
