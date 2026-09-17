import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "account"
  | "add"
  | "archive"
  | "cart"
  | "categories"
  | "dashboard"
  | "edit"
  | "export"
  | "filters"
  | "orders"
  | "products"
  | "revenue"
  | "search"
  | "sign-out"
  | "stock"
  | "supplier";

const paths: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <path d="M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z" />
    </>
  ),
  products: (
    <>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Zm8 4v10" />
    </>
  ),
  orders: (
    <>
      <path d="M7 3h10v3H7V3Z" />
      <path d="M5 5h14v16H5V5Zm4 5h6m-6 4h6m-6 4h4" />
    </>
  ),
  categories: (
    <>
      <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.2 10h9.9l2-7H6" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="17" cy="19" r="1" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  add: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13 7 4 4" />
    </>
  ),
  archive: (
    <>
      <path d="M4 7h16v13H4V7Zm-1-4h18v4H3V3Z" />
      <path d="M9 11h6" />
    </>
  ),
  export: (
    <>
      <path d="M12 3v12m0-12 4 4m-4-4L8 7" />
      <path d="M5 13v7h14v-7" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  filters: <path d="M4 6h16M7 12h10m-7 6h4" />,
  stock: (
    <>
      <path d="M4 8h16v12H4V8Zm3-4h10v4H7V4Z" />
      <path d="M8 13h8" />
    </>
  ),
  revenue: (
    <>
      <path d="M4 19V9m6 10V5m6 14v-7m4 7H2" />
    </>
  ),
  supplier: (
    <>
      <path d="M3 21h18M5 21V8l7-4 7 4v13" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  "sign-out": (
    <>
      <path d="M10 4H4v16h6m5-4 4-4-4-4m4 4H9" />
    </>
  ),
};

export function AppIcon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className="app-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
