import { describe, expect, it, vi } from "vitest";

import { createSignOutRunner } from "@/components/sign-out-button";

describe("sign-out control", () => {
  it("invokes Better Auth semantics and replaces the destination on success", async () => {
    const signOut = vi.fn().mockResolvedValue({});
    const replace = vi.fn();
    const runner = createSignOutRunner({
      signOut,
      onSuccess: () => replace("/sign-in"),
      onFailure: vi.fn(),
    });

    await expect(runner()).resolves.toBe(true);
    expect(signOut).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  it("suppresses repeated clicks while sign-out is pending", async () => {
    let resolve!: (value: SignOutResult) => void;
    type SignOutResult = { error?: unknown };
    const signOut = vi.fn(
      () => new Promise<SignOutResult>((done) => (resolve = done)),
    );
    const runner = createSignOutRunner({
      signOut,
      onSuccess: vi.fn(),
      onFailure: vi.fn(),
    });

    const first = runner();
    await expect(runner()).resolves.toBe(false);
    expect(signOut).toHaveBeenCalledOnce();
    resolve({});
    await expect(first).resolves.toBe(true);
  });

  it.each(["returned error", "thrown error"])(
    "shows safe feedback for a %s",
    async (kind) => {
      const onFailure = vi.fn();
      const signOut =
        kind === "returned error"
          ? vi.fn().mockResolvedValue({ error: { message: "private detail" } })
          : vi.fn().mockRejectedValue(new Error("private detail"));
      const runner = createSignOutRunner({
        signOut,
        onSuccess: vi.fn(),
        onFailure,
      });

      await expect(runner()).resolves.toBe(false);
      expect(onFailure).toHaveBeenCalledOnce();
      expect(JSON.stringify(onFailure.mock.calls)).not.toContain(
        "private detail",
      );
    },
  );
});
