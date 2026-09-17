import { Role } from "@/generated/prisma/enums";
import type { Actor } from "@/modules/auth/authorization";

export type AuthenticatedNavLink = { href: string; label: string };

export const ROLE_HOME: Record<Role, string> = {
  [Role.ADMIN]: "/admin",
  [Role.SUPPLIER]: "/supplier",
  [Role.CUSTOMER]: "/account",
};

export const ROLE_NAVIGATION: Record<Role, readonly AuthenticatedNavLink[]> = {
  [Role.ADMIN]: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/categories", label: "Categories" },
    { href: "/orders", label: "Orders" },
    { href: "/products", label: "Public catalog" },
  ],
  [Role.SUPPLIER]: [
    { href: "/supplier", label: "Overview" },
    { href: "/supplier/products", label: "Products" },
    { href: "/orders", label: "Orders" },
    { href: "/products", label: "Public catalog" },
  ],
  [Role.CUSTOMER]: [
    { href: "/account", label: "Account" },
    { href: "/products", label: "Products" },
    { href: "/cart", label: "Cart" },
    { href: "/orders", label: "Orders" },
  ],
};

export const ROLE_WORKSPACE_LABEL: Record<Role, string> = {
  [Role.ADMIN]: "Admin workspace",
  [Role.SUPPLIER]: "Supplier workspace",
  [Role.CUSTOMER]: "Customer account",
};

export const PUBLIC_WORKSPACE_LABEL: Record<Role, string> = {
  [Role.ADMIN]: "Admin workspace",
  [Role.SUPPLIER]: "Supplier workspace",
  [Role.CUSTOMER]: "Customer workspace",
};

export function roleHome(role: Role): string {
  return ROLE_HOME[role];
}

export function enabledActorHome(actor: Actor | null): string | null {
  return actor && !actor.disabledAt ? roleHome(actor.role) : null;
}
