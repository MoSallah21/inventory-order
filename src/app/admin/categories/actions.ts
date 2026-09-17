"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Role } from "@/generated/prisma/enums";
import { serializeError } from "@/lib/errors";
import { requireRole } from "@/modules/auth/authorization";
import {
  archiveCategory,
  createCategory,
  restoreCategory,
  updateCategory,
} from "@/modules/catalog/service";

function input(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
}

function outcome(error?: unknown, create = false) {
  const query = new URLSearchParams();
  if (error) query.set("error", serializeError(error).message);
  else query.set("saved", "1");
  if (create && error) query.set("create", "1");
  return `/admin/categories?${query}`;
}

export async function createCategoryAction(formData: FormData) {
  try {
    await createCategory(await requireRole(Role.ADMIN), input(formData));
  } catch (error) {
    redirect(outcome(error, true));
  }
  revalidatePath("/admin/categories");
  revalidatePath("/products");
  redirect(outcome());
}

export async function updateCategoryAction(formData: FormData) {
  try {
    await updateCategory(
      await requireRole(Role.ADMIN),
      String(formData.get("id") ?? ""),
      input(formData),
    );
  } catch (error) {
    redirect(outcome(error));
  }
  revalidatePath("/admin/categories");
  revalidatePath("/products");
  redirect(outcome());
}

export async function archiveCategoryAction(formData: FormData) {
  try {
    await archiveCategory(
      await requireRole(Role.ADMIN),
      String(formData.get("id") ?? ""),
    );
  } catch (error) {
    redirect(outcome(error));
  }
  revalidatePath("/admin/categories");
  revalidatePath("/supplier/products");
  revalidatePath("/products");
  redirect(outcome());
}

export async function restoreCategoryAction(formData: FormData) {
  try {
    await restoreCategory(
      await requireRole(Role.ADMIN),
      String(formData.get("id") ?? ""),
    );
  } catch (error) {
    redirect(outcome(error));
  }
  revalidatePath("/admin/categories");
  revalidatePath("/supplier/products");
  revalidatePath("/products");
  redirect(outcome());
}
