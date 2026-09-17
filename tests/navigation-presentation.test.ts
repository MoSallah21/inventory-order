import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/enums";
import type { Actor } from "@/modules/auth/authorization";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
const auth = vi.hoisted(() => ({ getCurrentActor: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/modules/auth/authorization", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules/auth/authorization")>();
  return { ...original, getCurrentActor: auth.getCurrentActor };
});

import SignInPage from "@/app/sign-in/page";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import {
  activeNavigationHref,
  NavigationLink,
} from "@/components/navigation-link";
import { PublicNavigation } from "@/components/public-navigation";

const actor = (role: Role): Actor => ({
  id: `navigation-${role}`,
  role,
  name: `${role} User`,
  email: `${role.toLowerCase()}@example.test`,
  disabledAt: null,
});

function currentLinks(html: string) {
  return html.match(/<a\b[^>]*aria-current="page"[^>]*>/g) ?? [];
}

function headerLinks(html: string) {
  return html.match(/<a\b[^>]*>/g) ?? [];
}

describe("navigation presentation", () => {
  beforeEach(() => {
    navigation.pathname = "/";
    auth.getCurrentActor.mockReset();
    auth.getCurrentActor.mockResolvedValue(null);
  });

  it.each([
    ["/", ["/", "/products"], "/"],
    ["/products/product-1", ["/", "/products"], "/products"],
    ["/orders/order-1", ["/account", "/orders"], "/orders"],
    [
      "/supplier/products/new",
      ["/supplier", "/supplier/products"],
      "/supplier/products",
    ],
    ["/admin/categories", ["/admin", "/admin/categories"], "/admin/categories"],
  ])(
    "selects one longest boundary match for %s",
    (pathname, hrefs, expected) => {
      expect(activeNavigationHref(pathname, hrefs)).toBe(expected);
    },
  );

  it("does not treat a partial segment match as active", () => {
    expect(activeNavigationHref("/products-old", ["/products"])).toBeNull();
  });

  it.each([
    [Role.ADMIN, "/admin/categories", "/admin/categories"],
    [Role.SUPPLIER, "/supplier/products/new", "/supplier/products"],
    [Role.CUSTOMER, "/orders/order-1", "/orders"],
  ])(
    "marks one authenticated %s navigation item current",
    (role, pathname, expectedHref) => {
      navigation.pathname = pathname;
      const html = renderToStaticMarkup(
        createElement(AuthenticatedNavigation, { actor: actor(role) }),
      );
      const current = currentLinks(html);

      expect(current).toHaveLength(1);
      expect(current[0]).toContain(`href="${expectedHref}"`);
      expect(current[0]).toContain("nav-link-active");
      expect(current[0]).toContain("nav-touch-target");
      expect(
        headerLinks(html).every((link) => link.includes("nav-touch-target")),
      ).toBe(true);
    },
  );

  it.each([
    ["/", "/"],
    ["/products/product-1", "/products"],
  ])(
    "marks one public navigation item current at %s",
    async (pathname, expectedHref) => {
      navigation.pathname = pathname;
      const html = renderToStaticMarkup(
        await PublicNavigation({ actor: null }),
      );
      const current = currentLinks(html);

      expect(current).toHaveLength(1);
      expect(current[0]).toContain(`href="${expectedHref}"`);
      expect(current[0]).toContain("nav-link-active");
      expect(
        headerLinks(html).every((link) => link.includes("nav-touch-target")),
      ).toBe(true);
    },
  );

  it("gives the production link shared active and touch-target classes", () => {
    navigation.pathname = "/products/item";
    const html = renderToStaticMarkup(
      createElement(
        NavigationLink,
        { activeHrefs: ["/", "/products"], href: "/products" },
        "Products",
      ),
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain("nav-link-active");
    expect(html).toContain("nav-touch-target");
  });
});

describe("sign-in heading structure", () => {
  it("renders its single h1 before any lower-level heading", async () => {
    const html = renderToStaticMarkup(await SignInPage());
    const h1 = html.indexOf("<h1");
    const h2 = html.indexOf("<h2");

    expect(h1).toBeGreaterThanOrEqual(0);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(h2 === -1 || h1 < h2).toBe(true);
    expect(html).toContain("Keep inventory moving.");
  });
});
