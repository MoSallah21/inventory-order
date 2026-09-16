import { describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import {
  assertActorRole,
  assertAuthenticatedActor,
  type Actor,
} from "@/modules/auth/authorization";

const enabledCustomer: Actor = {
  id: "customer-1",
  name: "Customer",
  email: "customer@example.test",
  role: Role.CUSTOMER,
  disabledAt: null,
};

describe("authorization assertions", () => {
  it("rejects an unauthenticated request", () => {
    expect(() => assertAuthenticatedActor(null)).toThrowError(
      expect.objectContaining<Partial<AppError>>({ code: "UNAUTHENTICATED" }),
    );
  });

  it("rejects a role that is not allowed", () => {
    expect(() => assertActorRole(enabledCustomer, [Role.ADMIN])).toThrowError(
      expect.objectContaining<Partial<AppError>>({ code: "FORBIDDEN" }),
    );
  });

  it("rejects a disabled user", () => {
    expect(() =>
      assertAuthenticatedActor({ ...enabledCustomer, disabledAt: new Date() }),
    ).toThrowError(
      expect.objectContaining<Partial<AppError>>({ code: "FORBIDDEN" }),
    );
  });

  it("allows an enabled actor with an allowed role", () => {
    expect(
      assertActorRole(assertAuthenticatedActor(enabledCustomer), [
        Role.CUSTOMER,
      ]),
    ).toBe(enabledCustomer);
  });
});
