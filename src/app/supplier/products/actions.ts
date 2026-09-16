"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Role } from "@/generated/prisma/enums";
import { serializeError } from "@/lib/errors";
import { requireRole } from "@/modules/auth/authorization";
import {
  archiveProduct,
  authorizeProductImageMutation,
  createProductWithImage,
  updateProductWithImage,
} from "@/modules/catalog/service";
import { validateProductImage } from "@/modules/catalog/product-image";
import { parseRawStockQuantity } from "@/modules/catalog/stock";

function input(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    price: String(formData.get("price") ?? ""),
    stockQuantity: parseRawStockQuantity(formData.get("stockQuantity")),
  };
}

function outcome(path: string, error?: unknown, warning?: boolean) {
  const query = new URLSearchParams();
  if (error) query.set("error", serializeError(error).message);
  else query.set("saved", "1");
  if (warning) query.set("warning", "image-cleanup");
  return `${path}?${query}`;
}

function revalidateCatalog() {
  revalidatePath("/supplier/products");
  revalidatePath("/products");
}

export async function createProductAction(formData: FormData) {
  try {
    const actor = await requireRole(Role.SUPPLIER);
    const fields = input(formData);
    const image = await validateProductImage(formData.get("image"), true);
    if (!image) throw new Error("Required image was not validated.");
    await createProductWithImage(actor, fields, image);
  } catch (error) {
    redirect(outcome("/supplier/products/new", error));
  }
  revalidateCatalog();
  redirect(outcome("/supplier/products"));
}

export async function updateProductAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  let cleanupWarning = false;
  try {
    const actor = await requireRole(Role.SUPPLIER);
    await authorizeProductImageMutation(actor, id);
    const fields = input(formData);
    const image = await validateProductImage(formData.get("image"), false);
    const removeImage = formData.get("removeImage") === "on";
    const result = await updateProductWithImage(
      actor,
      id,
      fields,
      image,
      removeImage,
    );
    cleanupWarning = result.cleanupWarning;
  } catch (error) {
    redirect(
      outcome(`/supplier/products/${encodeURIComponent(id)}/edit`, error),
    );
  }
  revalidateCatalog();
  revalidatePath(`/products/${id}`);
  redirect(outcome("/supplier/products", undefined, cleanupWarning));
}

export async function archiveProductAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  try {
    await archiveProduct(await requireRole(Role.SUPPLIER), id);
  } catch (error) {
    redirect(outcome("/supplier/products", error));
  }
  revalidateCatalog();
  revalidatePath(`/products/${id}`);
  redirect(outcome("/supplier/products"));
}
