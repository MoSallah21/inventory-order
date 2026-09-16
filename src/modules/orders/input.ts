import { AppError } from "@/lib/errors";

export const ORDER_LINE_MAX = 50;
export const ORDER_QUANTITY_MAX = 10_000;
export const PRODUCT_ID_MAX = 191;
export const IDEMPOTENCY_KEY_MIN = 16;
export const IDEMPOTENCY_KEY_MAX = 100;

export type RawOrderLine = {
  productId: unknown;
  quantity: unknown;
};

export type ParsedOrderSubmission = {
  idempotencyKey: string;
  items: Array<{ productId: string; quantity: number }>;
};

function fail(field: string, message: string): never {
  throw new AppError("VALIDATION_FAILED", "Please correct the order.", {
    [field]: [message],
  });
}

export function parseOrderQuantity(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    fail(
      "quantity",
      `Quantity must be a whole number from 1-${ORDER_QUANTITY_MAX}.`,
    );
  }
  if (value.length > String(ORDER_QUANTITY_MAX).length) {
    fail(
      "quantity",
      `Quantity must be a whole number from 1-${ORDER_QUANTITY_MAX}.`,
    );
  }
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity > ORDER_QUANTITY_MAX) {
    fail(
      "quantity",
      `Quantity must be a whole number from 1-${ORDER_QUANTITY_MAX}.`,
    );
  }
  return quantity;
}

export function parseOrderSubmission(raw: {
  idempotencyKey: unknown;
  items: unknown;
}): ParsedOrderSubmission {
  if (
    typeof raw.idempotencyKey !== "string" ||
    raw.idempotencyKey.length < IDEMPOTENCY_KEY_MIN ||
    raw.idempotencyKey.length > IDEMPOTENCY_KEY_MAX ||
    !/^[A-Za-z0-9_-]+$/.test(raw.idempotencyKey)
  ) {
    fail(
      "idempotencyKey",
      `Request key must be ${IDEMPOTENCY_KEY_MIN}-${IDEMPOTENCY_KEY_MAX} letters, numbers, underscores, or hyphens.`,
    );
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    fail("items", "Add at least one product.");
  }
  if (raw.items.length > ORDER_LINE_MAX) {
    fail(
      "items",
      `An order can contain at most ${ORDER_LINE_MAX} distinct products.`,
    );
  }

  const seen = new Set<string>();
  const items = raw.items.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      fail("items", `Order line ${index + 1} is invalid.`);
    }
    const line = candidate as RawOrderLine;
    if (
      typeof line.productId !== "string" ||
      line.productId.length === 0 ||
      line.productId.length > PRODUCT_ID_MAX ||
      line.productId.trim() !== line.productId
    ) {
      fail("productId", "Product identifiers are invalid.");
    }
    if (seen.has(line.productId)) {
      fail("items", "Each product may appear only once.");
    }
    seen.add(line.productId);
    return {
      productId: line.productId,
      quantity: parseOrderQuantity(line.quantity),
    };
  });

  return { idempotencyKey: raw.idempotencyKey, items };
}

export function parseOrderFormData(formData: FormData) {
  const productIds = formData.getAll("productId");
  const quantities = formData.getAll("quantity");
  if (productIds.length !== quantities.length) {
    fail("items", "Every product requires a quantity.");
  }
  return parseOrderSubmission({
    idempotencyKey: formData.get("idempotencyKey"),
    items: productIds.map((productId, index) => ({
      productId,
      quantity: quantities[index],
    })),
  });
}
