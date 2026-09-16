"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Role } from "@/generated/prisma/enums";
import { serializeError } from "@/lib/errors";
import { requireRole } from "@/modules/auth/authorization";
import {
  archiveProduct,
  createProduct,
  updateProduct,
} from "@/modules/catalog/service";
import { parseRawStockQuantity } from "@/modules/catalog/stock";

function input(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    price: String(formData.get("price") ?? ""),
    stockQuantity: parseRawStockQuantity(formData.get("stockQuantity")),
    imageUrl: String(formData.get("imageUrl") ?? ""),
  };
}

function outcome(path: string, error?: unknown) {
  const query = new URLSearchParams();
  if (error) query.set("error", serializeError(error).message);
  else query.set("saved", "1");
  return `${path}?${query}`;
}

function revalidateCatalog() {
  revalidatePath("/supplier/products");
  revalidatePath("/products");
}

export async function createProductAction(formData: FormData) {
  try {
    await createProduct(await requireRole(Role.SUPPLIER), input(formData));
  } catch (error) {
    redirect(outcome("/supplier/products/new", error));
  }
  revalidateCatalog();
  redirect(outcome("/supplier/products"));
}

export async function updateProductAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  try {
    await updateProduct(await requireRole(Role.SUPPLIER), id, input(formData));
  } catch (error) {
    redirect(
      outcome(`/supplier/products/${encodeURIComponent(id)}/edit`, error),
    );
  }
  revalidateCatalog();
  revalidatePath(`/products/${id}`);
  redirect(outcome("/supplier/products"));
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
