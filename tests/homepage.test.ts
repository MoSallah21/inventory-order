import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/enums";
import type { Actor } from "@/modules/auth/authorization";

const mocks = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
}));

vi.mock("@/modules/auth/authorization", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules/auth/authorization")>();
  return { ...original, getCurrentActor: mocks.getCurrentActor };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import Home from "@/app/page";

const actor = (role: Role, disabledAt: Date | null = null): Actor => ({
  id: role,
  name: role,
  email: `${role.toLowerCase()}@example.test`,
  role,
  disabledAt,
});

async function renderHomepage(currentActor: Actor | null) {
  mocks.getCurrentActor.mockResolvedValue(currentActor);
  return renderToStaticMarkup(await Home());
}

function expectPublicCatalog(html: string) {
  expect(html).toContain('href="/products"');
  expect(html).toContain("Browse products");
}

describe("homepage authentication state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows anonymous messaging and sign-in without a workspace link", async () => {
    const html = await renderHomepage(null);

    expect(html).toContain("or sign in");
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Back to");
    expectPublicCatalog(html);
  });

  it.each([
    [Role.ADMIN, "/admin", "Back to Admin workspace"],
    [Role.SUPPLIER, "/supplier", "Back to Supplier workspace"],
    [Role.CUSTOMER, "/account", "Back to Customer workspace"],
  ])(
    "shows the %s workspace and no anonymous-only messaging",
    async (role, destination, label) => {
      const html = await renderHomepage(actor(role));

      expect(html).toContain(`href="${destination}"`);
      expect(html).toContain(label);
      expect(html).not.toContain('href="/sign-in"');
      expect(html).not.toContain("Sign in");
      expect(html).not.toContain("or sign in");
      expectPublicCatalog(html);
      expect(mocks.getCurrentActor).toHaveBeenCalledTimes(1);
    },
  );

  it("treats a disabled actor as anonymous", async () => {
    const html = await renderHomepage(actor(Role.ADMIN, new Date()));

    expect(html).toContain('href="/sign-in"');
    expect(html).toContain("or sign in");
    expect(html).not.toContain("Back to Admin workspace");
    expectPublicCatalog(html);
  });
});
