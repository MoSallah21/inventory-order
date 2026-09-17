import { beforeEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/page-authorization", () => ({
  requireProtectedPage: mocks.actor,
}));

import RoleRedirectPage from "@/app/auth/redirect/page";

beforeEach(() => vi.clearAllMocks());

describe("trusted post-sign-in role redirect (database actor reload is covered by auth-session.test.ts)", () => {
  it.each([
    [Role.ADMIN, "/admin"],
    [Role.SUPPLIER, "/supplier"],
    [Role.CUSTOMER, "/account"],
  ])(
    "maps the trusted-boundary %s actor to the %s home",
    async (role, home) => {
      mocks.actor.mockResolvedValue({
        id: "current-user",
        role,
        name: "Current User",
        email: "current@example.test",
        disabledAt: null,
      });

      await expect(RoleRedirectPage()).rejects.toThrow(`REDIRECT:${home}`);
      expect(mocks.actor).toHaveBeenCalledWith(
        Role.ADMIN,
        Role.SUPPLIER,
        Role.CUSTOMER,
      );
      expect(mocks.redirect).toHaveBeenCalledOnce();
    },
  );
});
