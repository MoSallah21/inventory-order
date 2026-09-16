import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { ProductForm } from "@/components/product-form";
import { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import {
  getSupplierProduct,
  listActiveCategories,
} from "@/modules/catalog/service";
import { updateProductAction } from "../../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};
export default async function EditProductPage({ params, searchParams }: Props) {
  const actor = await requireProtectedPage(Role.SUPPLIER);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [product, categories] = await (async () => {
    try {
      return await Promise.all([
        getSupplierProduct(actor, id),
        listActiveCategories(actor),
      ]);
    } catch (error) {
      if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
      throw error;
    }
  })();
  return (
    <main className="page-shell narrow">
      <AuthenticatedNavigation actor={actor} />
      <Link href="/supplier/products">← Products</Link>
      <p className="eyebrow">Supplier catalog</p>
      <h1>Edit product</h1>
      {query.error ? <p className="notice error">{query.error}</p> : null}
      <section className="panel">
        <ProductForm
          action={updateProductAction}
          categories={categories}
          product={product}
        />
      </section>
    </main>
  );
}
