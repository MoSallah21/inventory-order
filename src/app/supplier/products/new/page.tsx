import Link from "next/link";
import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { ProductForm } from "@/components/product-form";
import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listActiveCategories } from "@/modules/catalog/service";
import { createProductAction } from "../actions";
import { PageHeader } from "@/components/page-header";

type Props = { searchParams: Promise<{ error?: string }> };
export default async function NewProductPage({ searchParams }: Props) {
  const actor = await requireProtectedPage(Role.SUPPLIER);
  const [categories, query] = await Promise.all([
    listActiveCategories(actor),
    searchParams,
  ]);
  return (
    <main className="page-shell workspace-page" id="workspace-content">
      <AuthenticatedNavigation actor={actor} />
      <PageHeader
        eyebrow="Supplier catalog"
        title="Add product"
        description="Create a sellable inventory record with classification, pricing, stock, and media."
        actions={
          <Link className="button-link secondary" href="/supplier/products">
            Back to inventory
          </Link>
        }
      />
      {query.error ? (
        <p className="notice error" role="alert">
          {query.error}
        </p>
      ) : null}
      <section className="panel">
        <ProductForm action={createProductAction} categories={categories} />
      </section>
    </main>
  );
}
