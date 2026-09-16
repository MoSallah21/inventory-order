import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import { genuineProductImages } from "./fixtures/product-images";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  authorize: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/modules/auth/authorization", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "supplier", role: "SUPPLIER" }),
}));
vi.mock("@/modules/catalog/service", () => ({
  archiveProduct: vi.fn(),
  authorizeProductImageMutation: mocks.authorize,
  createProductWithImage: mocks.create,
  updateProductWithImage: mocks.update,
}));

import {
  createProductAction,
  updateProductAction,
} from "@/app/supplier/products/actions";

function data(image?: FormDataEntryValue, removeImage = false) {
  const form = new FormData();
  form.set("id", "product");
  form.set("name", "Product");
  form.set("description", "Description");
  form.set("categoryId", "category");
  form.set("price", "1.00");
  form.set("stockQuantity", "1");
  if (image !== undefined) form.set("image", image);
  if (removeImage) form.set("removeImage", "on");
  return form;
}

function png() {
  return new File([genuineProductImages.png], "product.png", {
    type: "image/png",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue({ cleanupWarning: false });
});

describe("product action runtime behavior", () => {
  it("returns the required-image message when create omits the image", async () => {
    await expect(createProductAction(data())).rejects.toThrow(
      "REDIRECT:/supplier/products/new?error=Choose+a+JPEG%2C+PNG%2C+or+WebP+image.",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps the current image when update omits the image field", async () => {
    await expect(updateProductAction(data())).rejects.toThrow(
      "REDIRECT:/supplier/products?saved=1",
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.anything(),
      "product",
      expect.anything(),
      null,
      false,
    );
  });

  it.each([
    ["React transport metadata", "blob", "application/octet-stream"],
    ["empty filename", "", "application/octet-stream"],
    ["named PNG", "empty.png", "image/png"],
  ])("rejects a crafted zero-byte File with %s", async (_case, name, type) => {
    await expect(
      updateProductAction(data(new File([], name, { type }))),
    ).rejects.toThrow(
      "REDIRECT:/supplier/products/product/edit?error=The+image+file+is+empty.",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("passes a genuine replacement file to the managed-image service", async () => {
    await expect(updateProductAction(data(png()))).rejects.toThrow(
      "REDIRECT:/supplier/products?saved=1",
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.anything(),
      "product",
      expect.anything(),
      expect.objectContaining({ format: "png" }),
      false,
    );
  });

  it("passes removal alone and preserves replacement-plus-removal rejection", async () => {
    await expect(updateProductAction(data(undefined, true))).rejects.toThrow(
      "REDIRECT:/supplier/products?saved=1",
    );
    expect(mocks.update).toHaveBeenLastCalledWith(
      expect.anything(),
      "product",
      expect.anything(),
      null,
      true,
    );

    mocks.update.mockRejectedValueOnce(
      new AppError(
        "VALIDATION_FAILED",
        "Choose either a replacement image or remove the current image.",
      ),
    );
    await expect(updateProductAction(data(png(), true))).rejects.toThrow(
      "REDIRECT:/supplier/products/product/edit?error=Choose+either+a+replacement+image+or+remove+the+current+image.",
    );
  });

  it("preserves known external-service messages but hides unknown errors", async () => {
    mocks.create.mockRejectedValueOnce(
      new AppError("EXTERNAL_SERVICE_ERROR", "Upload failed safely."),
    );
    await expect(createProductAction(data(png()))).rejects.toThrow(
      "REDIRECT:/supplier/products/new?error=Upload+failed+safely.",
    );

    mocks.create.mockRejectedValueOnce(new Error("database password leaked"));
    await expect(createProductAction(data(png()))).rejects.toThrow(
      "REDIRECT:/supplier/products/new?error=An+unexpected+error+occurred.",
    );
  });

  it("uses only the first safe field message in the redirect", async () => {
    mocks.create.mockRejectedValueOnce(
      new AppError("VALIDATION_FAILED", "Please correct the form.", {
        image: ["Unsupported image format."],
        internal: ["SQL and /internal/path must not reach the query string"],
      }),
    );
    let message = "";
    try {
      await createProductAction(data(png()));
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("error=Unsupported+image+format.");
    expect(message).not.toContain("SQL");
    expect(message).not.toContain("internal");
  });
});
