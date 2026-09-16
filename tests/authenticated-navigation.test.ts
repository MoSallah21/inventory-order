import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/enums";
import type { Actor } from "@/modules/auth/authorization";
import { enabledActorHome, ROLE_NAVIGATION } from "@/modules/auth/navigation";

const actor = (role: Role, disabledAt: Date | null = null): Actor => ({
  id: role,
  name: role,
  email: `${role.toLowerCase()}@example.test`,
  role,
  disabledAt,
});

describe("authenticated role navigation", () => {
  it.each([
    [Role.ADMIN, ["/admin", "/admin/categories", "/orders", "/products"]],
    [
      Role.SUPPLIER,
      ["/supplier", "/supplier/products", "/orders", "/products"],
    ],
    [Role.CUSTOMER, ["/account", "/products", "/cart", "/orders"]],
  ])("provides the expected links for %s", (role, expected) => {
    expect(ROLE_NAVIGATION[role].map(({ href }) => href)).toEqual(expected);
  });

  it("only links to routes that exist", async () => {
    const app = fileURLToPath(new URL("../src/app", import.meta.url));
    const routes = new Set(
      Object.values(ROLE_NAVIGATION).flatMap((links) =>
        links.map(({ href }) => href),
      ),
    );
    await Promise.all(
      [...routes].map((route) => access(`${app}${route}/page.tsx`)),
    );
  });

  it.each([
    [Role.ADMIN, "/admin"],
    [Role.SUPPLIER, "/supplier"],
    [Role.CUSTOMER, "/account"],
  ])("redirects an enabled %s away from sign-in", (role, expected) => {
    expect(enabledActorHome(actor(role))).toBe(expected);
  });

  it("does not redirect a disabled actor into protected content", () => {
    expect(enabledActorHome(actor(Role.ADMIN, new Date()))).toBeNull();
  });
});
