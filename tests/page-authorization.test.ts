import { describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/enums";
import type { Actor } from "@/modules/auth/authorization";
import { protectedPageDestination } from "@/modules/auth/page-authorization";

const actor = (role: Role, disabledAt: Date | null = null): Actor => ({
  id: role,
  name: role,
  email: `${role.toLowerCase()}@example.test`,
  role,
  disabledAt,
});

describe("protected page redirects", () => {
  it("redirects anonymous access to sign-in", () => {
    expect(protectedPageDestination(null, [Role.CUSTOMER])).toBe("/sign-in");
  });

  it("redirects the wrong role to its own home", () => {
    expect(protectedPageDestination(actor(Role.SUPPLIER), [Role.ADMIN])).toBe(
      "/supplier",
    );
  });

  it("denies a disabled actor", () => {
    expect(
      protectedPageDestination(actor(Role.CUSTOMER, new Date()), [
        Role.CUSTOMER,
      ]),
    ).toBe("/sign-in");
  });

  it("allows an enabled actor with the required role", () => {
    expect(
      protectedPageDestination(actor(Role.ADMIN), [Role.ADMIN]),
    ).toBeNull();
  });
});
