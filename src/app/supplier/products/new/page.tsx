import Link from "next/link";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { ProductForm } from "@/components/product-form";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listActiveCategories } from "@/modules/catalog/service";
import { createProductAction } from "../actions";

type Props = { searchParams: Promise<{ error?: string }> };
export default async function NewProductPage({ searchParams }: Props) {
  const actor = await requireProtectedPage(Role.SUPPLIER);
  const [categories, query] = await Promise.all([
    listActiveCategories(actor),
    searchParams,
  ]);
  return (
    <main className="page-shell narrow">
      <AuthenticatedNavigation actor={actor} />
      <Link href="/supplier/products">← Products</Link>
      <p className="eyebrow">Supplier catalog</p>
      <h1>Add product</h1>
      {query.error ? <p className="notice error">{query.error}</p> : null}
      <section className="panel">
        <ProductForm action={createProductAction} categories={categories} />
      </section>
    </main>
  );
}
