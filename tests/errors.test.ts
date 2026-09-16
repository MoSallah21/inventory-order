import { describe, expect, it } from "vitest";

import { AppError, serializeError } from "@/lib/errors";

describe("serializeError", () => {
  it("prefers a safe field-specific message for expected errors", () => {
    expect(
      serializeError(
        new AppError("VALIDATION_FAILED", "Invalid input.", {
          name: ["Required"],
        }),
      ),
    ).toEqual({
      code: "VALIDATION_FAILED",
      message: "Required",
      fieldErrors: { name: ["Required"] },
    });
  });

  it("does not expose unexpected error details", () => {
    expect(serializeError(new Error("database password leaked"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    });
  });
});
