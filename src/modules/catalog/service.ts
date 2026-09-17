import { Prisma } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatMinorUnits } from "@/lib/money";
import {
  clampPage,
  PAGE_SIZE,
  pageCount,
  singleQueryValue,
  type QueryValue,
} from "@/lib/pagination";
import {
  assertActorRole,
  assertAuthenticatedActor,
  type Actor,
} from "@/modules/auth/authorization";
import { STOCK_MAX } from "@/modules/catalog/stock";
import {
  isManagedProductImageKey,
  productImageStorage,
  reportImageCleanupFailure,
  type ProductImageStorage,
} from "@/modules/catalog/image-storage";
import type { ValidatedProductImage } from "@/modules/catalog/product-image";

const CATEGORY_NAME_MAX = 80;
const PRODUCT_NAME_MAX = 120;
const PRODUCT_DESCRIPTION_MAX = 2_000;
const PRICE_MAX_MINOR = 999_999_999n;
const SEARCH_MAX = 120;

export type PublicProductQuery = {
  q?: QueryValue;
  category?: QueryValue;
  supplier?: QueryValue;
  minPrice?: QueryValue;
  maxPrice?: QueryValue;
  inStock?: QueryValue;
};

export type PublicProductFilters = {
  q: string;
  category: string;
  supplier: string;
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  minPriceMinor?: bigint;
  maxPriceMinor?: bigint;
  error?: string;
};

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

export type ManagedProductInput = Omit<ProductInput, "imageUrl">;

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

function parseFilterPrice(value: QueryValue) {
  const raw = singleQueryValue(value)?.trim() ?? "";
  if (!raw) return { raw: "" };
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) {
    return {
      raw: "",
      error:
        "Enter prices as non-negative AED amounts with up to two decimals.",
    };
  }
  const [major, fraction = ""] = raw.split(".");
  const minor = BigInt(major) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > PRICE_MAX_MINOR) {
    return {
      raw: "",
      error: "The selected price is above the supported maximum.",
    };
  }
  return { raw, minor };
}

export function parsePublicProductFilters(
  query: PublicProductQuery,
): PublicProductFilters {
  const qValue = singleQueryValue(query.q)?.trim().replace(/\s+/g, " ") ?? "";
  const min = parseFilterPrice(query.minPrice);
  const max = parseFilterPrice(query.maxPrice);
  const minMaxError =
    min.minor !== undefined && max.minor !== undefined && min.minor > max.minor
      ? "Minimum price cannot exceed maximum price."
      : undefined;
  return {
    q: qValue.slice(0, SEARCH_MAX),
    category: singleQueryValue(query.category)?.trim() ?? "",
    supplier: singleQueryValue(query.supplier)?.trim() ?? "",
    minPrice: min.raw,
    maxPrice: max.raw,
    inStock: singleQueryValue(query.inStock) === "true",
    minPriceMinor: min.minor,
    maxPriceMinor: max.minor,
    error: min.error ?? max.error ?? minMaxError,
  };
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

function normalizeManagedProductInput(input: ManagedProductInput) {
  const {
    imageUrl: _imageUrl,
    imageStorageKey: _imageStorageKey,
    ...data
  } = normalizeProductInput({ ...input, imageUrl: "https://managed.invalid" });
  void _imageUrl;
  void _imageStorageKey;
  return data;
}

async function reloadSupplier(actor: Actor) {
  const reloaded = await prisma.user.findUnique({
    where: { id: actor.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      disabledAt: true,
    },
  });
  return requireActorRole(assertAuthenticatedActor(reloaded), Role.SUPPLIER);
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
  const rows = await tx.$queryRaw<ProductImageSnapshot[]>(Prisma.sql`
    SELECT "id", "supplierId", "imageUrl", "imageStorageKey", "archivedAt"
    FROM "Product"
    WHERE "id" = ${productId} AND "supplierId" = ${supplierId}
    FOR UPDATE
  `);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Product not found.");
  return rows[0];
}

type ProductImageSnapshot = {
  id: string;
  supplierId: string;
  imageUrl: string;
  imageStorageKey: string;
  archivedAt: Date | null;
};

function sameImageState(
  current: ProductImageSnapshot,
  snapshot: ProductImageSnapshot,
) {
  return (
    current.imageUrl === snapshot.imageUrl &&
    current.imageStorageKey === snapshot.imageStorageKey &&
    current.archivedAt?.getTime() === snapshot.archivedAt?.getTime()
  );
}

async function getProductImageSnapshot(supplierId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, supplierId },
    select: {
      id: true,
      supplierId: true,
      imageUrl: true,
      imageStorageKey: true,
      archivedAt: true,
    },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found.");
  return product;
}

export async function authorizeProductImageMutation(actor: Actor, id: string) {
  const supplier = await reloadSupplier(actor);
  await getProductImageSnapshot(supplier.id, id);
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

export async function restoreCategory(actor: Actor, id: string) {
  requireActorRole(actor, Role.ADMIN);
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await lockCategoryForUpdate(tx, id);
      if (!locked.archivedAt) {
        return tx.category.findUniqueOrThrow({ where: { id } });
      }
      return tx.category.update({
        where: { id },
        data: { archivedAt: null },
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

async function compensateUpload(
  storage: ProductImageStorage,
  storageKey: string,
) {
  try {
    await storage.delete(storageKey);
  } catch (error) {
    reportImageCleanupFailure("upload-compensation", storageKey, error);
  }
}

export async function createProductWithImage(
  actor: Actor,
  input: ManagedProductInput,
  image: ValidatedProductImage,
  storage: ProductImageStorage = productImageStorage,
) {
  const data = normalizeManagedProductInput(input);
  const supplier = await reloadSupplier(actor);
  const uploaded = await storage.upload(image);
  try {
    return await prisma.$transaction(async (tx) => {
      await requireLockedActiveCategory(tx, data.categoryId);
      return tx.product.create({
        data: {
          ...data,
          imageUrl: uploaded.url,
          imageStorageKey: uploaded.storageKey,
          currency: "AED",
          supplierId: supplier.id,
        },
      });
    });
  } catch (error) {
    await compensateUpload(storage, uploaded.storageKey);
    mapDatabaseError(error);
  }
}

export async function updateProductWithImage(
  actor: Actor,
  id: string,
  input: ManagedProductInput,
  image: ValidatedProductImage | null,
  removeImage: boolean,
  storage: ProductImageStorage = productImageStorage,
) {
  if (image && removeImage) {
    validationError("image", "Choose either replacement or removal, not both.");
  }
  const data = normalizeManagedProductInput(input);
  const supplier = await reloadSupplier(actor);
  const snapshot = await getProductImageSnapshot(supplier.id, id);

  const uploaded = image ? await storage.upload(image) : null;
  try {
    const product = await prisma.$transaction(async (tx) => {
      // Product-before-category is the catalog-wide lock order.
      const current = await requireLockedSupplierProduct(tx, supplier.id, id);
      if (!sameImageState(current, snapshot)) {
        throw new AppError(
          "CONFLICT",
          "The product image changed. Refresh and try again.",
        );
      }
      await requireLockedActiveCategory(tx, data.categoryId);
      return tx.product.update({
        where: { id },
        data: {
          ...data,
          ...(uploaded
            ? {
                imageUrl: uploaded.url,
                imageStorageKey: uploaded.storageKey,
              }
            : removeImage
              ? { imageUrl: "", imageStorageKey: "" }
              : {}),
        },
      });
    });

    let cleanupWarning = false;
    if (
      (uploaded || removeImage) &&
      isManagedProductImageKey(snapshot.imageStorageKey)
    ) {
      try {
        await storage.delete(snapshot.imageStorageKey);
      } catch (error) {
        reportImageCleanupFailure(
          "replaced-image-cleanup",
          snapshot.imageStorageKey,
          error,
        );
        cleanupWarning = true;
      }
    }
    return { product, cleanupWarning };
  } catch (error) {
    if (uploaded) await compensateUpload(storage, uploaded.storageKey);
    mapDatabaseError(error);
  }
}

export async function removeProductImage(
  actor: Actor,
  id: string,
  storage: ProductImageStorage = productImageStorage,
  hooks?: { afterSnapshot?: () => Promise<void> },
) {
  const supplier = await reloadSupplier(actor);
  const snapshot = await getProductImageSnapshot(supplier.id, id);
  await hooks?.afterSnapshot?.();

  const cleared = await prisma.$transaction(async (tx) => {
    const current = await requireLockedSupplierProduct(tx, supplier.id, id);
    if (!sameImageState(current, snapshot)) {
      throw new AppError(
        "CONFLICT",
        "The product image changed. Refresh and try again.",
      );
    }
    if (!current.imageUrl && !current.imageStorageKey) return current;
    await tx.product.update({
      where: { id },
      data: { imageUrl: "", imageStorageKey: "" },
    });
    return current;
  });
  if (isManagedProductImageKey(cleared.imageStorageKey)) {
    try {
      await storage.delete(cleared.imageStorageKey);
      return { cleanupWarning: false };
    } catch (error) {
      reportImageCleanupFailure(
        "removed-image-cleanup",
        cleared.imageStorageKey,
        error,
      );
      return { cleanupWarning: true };
    }
  }
  return { cleanupWarning: false };
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
    priceMinor: product.priceMinor.toString(),
    currency: product.currency,
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

export async function listPublicProductOptions() {
  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({
      where: { archivedAt: null, products: { some: publicWhere } },
      select: { name: true, slug: true },
      orderBy: [{ name: "asc" }, { slug: "asc" }],
    }),
    prisma.user.findMany({
      where: {
        role: Role.SUPPLIER,
        disabledAt: null,
        products: { some: publicWhere },
      },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
  ]);
  return { categories, suppliers };
}

export async function listPublicProductsPage(
  query: PublicProductQuery,
  requestedPage: number,
) {
  const filters = parsePublicProductFilters(query);
  const where: Prisma.ProductWhereInput = {
    ...publicWhere,
    ...(filters.q
      ? { name: { contains: filters.q, mode: "insensitive" } }
      : {}),
    ...(filters.category
      ? { category: { archivedAt: null, slug: filters.category } }
      : {}),
    ...(filters.supplier ? { supplierId: filters.supplier } : {}),
    ...(filters.inStock ? { stockQuantity: { gt: 0 } } : {}),
    ...(!filters.error &&
    (filters.minPriceMinor !== undefined || filters.maxPriceMinor !== undefined)
      ? {
          priceMinor: {
            gte: filters.minPriceMinor,
            lte: filters.maxPriceMinor,
          },
        }
      : {}),
  };
  const [totalCount, options] = await Promise.all([
    filters.error ? Promise.resolve(0) : prisma.product.count({ where }),
    listPublicProductOptions(),
  ]);
  const page = clampPage(requestedPage, totalCount);
  const rows = filters.error
    ? []
    : await prisma.product.findMany({
        where,
        select: publicProductSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      });
  return {
    products: rows.map(toPublicProduct),
    filters,
    options,
    page,
    pageCount: pageCount(totalCount),
    totalCount,
    pageSize: PAGE_SIZE,
  };
}

export async function getPublicProduct(id: string) {
  const product = await prisma.product.findFirst({
    where: { ...publicWhere, id },
    select: publicProductSelect,
  });
  return product ? toPublicProduct(product) : null;
}
