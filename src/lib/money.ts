import { AppError } from "@/lib/errors";

export const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

function moneyRangeError(): never {
  throw new AppError(
    "VALIDATION_FAILED",
    "The order total is above the supported maximum.",
  );
}

export function multiplyMinorUnits(
  unitPriceMinor: bigint,
  quantity: number,
): bigint {
  if (unitPriceMinor < 0n || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new AppError("VALIDATION_FAILED", "Money inputs are invalid.");
  }

  const multiplier = BigInt(quantity);
  if (unitPriceMinor > POSTGRES_BIGINT_MAX / multiplier) moneyRangeError();
  return unitPriceMinor * multiplier;
}

export function addMinorUnits(left: bigint, right: bigint): bigint {
  if (left < 0n || right < 0n || left > POSTGRES_BIGINT_MAX - right) {
    moneyRangeError();
  }
  return left + right;
}

export function formatMinorUnits(
  amountMinor: bigint,
  currency = "AED",
): string {
  const sign = amountMinor < 0n ? "-" : "";
  const absolute = amountMinor < 0n ? -amountMinor : amountMinor;
  const major = absolute / 100n;
  const minor = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${currency} ${major}.${minor}`;
}
