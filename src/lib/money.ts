import { AppError } from "@/lib/errors";

export function multiplyMinorUnits(
  unitPriceMinor: bigint,
  quantity: number,
): bigint {
  if (unitPriceMinor < 0n || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new AppError("VALIDATION_FAILED", "Money inputs are invalid.");
  }

  return unitPriceMinor * BigInt(quantity);
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
