import { AppError } from "@/lib/errors";

export const STOCK_MAX = 1_000_000;
const MAX_RAW_STOCK_LENGTH = String(Number.MAX_SAFE_INTEGER).length;

function invalidStock(): never {
  throw new AppError("VALIDATION_FAILED", "Please correct the form.", {
    stockQuantity: [`Stock must be an integer from 0-${STOCK_MAX}.`],
  });
}

/** Accepts canonical decimal syntax only: `0` or a non-zero digit followed by digits. */
export function parseRawStockQuantity(raw: FormDataEntryValue | null): number {
  if (typeof raw !== "string") invalidStock();
  if (raw.length > MAX_RAW_STOCK_LENGTH || !/^(?:0|[1-9]\d*)$/.test(raw)) {
    invalidStock();
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > STOCK_MAX) invalidStock();
  return value;
}
