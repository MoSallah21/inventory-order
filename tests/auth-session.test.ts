import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({}) }));
vi.mock("@/modules/auth/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));

import { getCurrentActor } from "@/modules/auth/authorization";

describe("database-backed actor resolution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails actor resolution after the session has been invalidated", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(getCurrentActor()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("reloads the actor role and disabled state from the database", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Updated",
      email: "updated@example.test",
      role: "ADMIN",
      disabledAt: null,
    });

    await expect(getCurrentActor()).resolves.toMatchObject({ role: "ADMIN" });
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
  });
});
