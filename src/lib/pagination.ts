export const PAGE_SIZE = 10;
const PAGE_MAX = 1_000_000;

export type QueryValue = string | string[] | undefined;

export function singleQueryValue(value: QueryValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parsePage(value: QueryValue): number {
  const single = singleQueryValue(value);
  if (!single || !/^[1-9]\d*$/.test(single) || single.length > 7) return 1;
  const page = Number(single);
  return Number.isSafeInteger(page) && page <= PAGE_MAX ? page : 1;
}

export function pageCount(totalCount: number) {
  return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
}

export function clampPage(requestedPage: number, totalCount: number) {
  return Math.min(requestedPage, pageCount(totalCount));
}
