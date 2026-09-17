import Link from "next/link";

import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { ProductImage } from "@/components/product-presentation";
import { Role } from "@/generated/prisma/enums";
import { formatMinorUnits } from "@/lib/money";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listSupplierProducts } from "@/modules/catalog/service";

import { archiveProductAction } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string; saved?: string; warning?: string }>;
};

export default async function SupplierProductsPage({ searchParams }: Props) {
  const actor = await requireProtectedPage(Role.SUPPLIER);
  const [products, query] = await Promise.all([
    listSupplierProducts(actor),
    searchParams,
  ]);
  return (
    <main className="page-shell">
      <AuthenticatedNavigation actor={actor} />
      <div className="row">
        <div>
          <p className="eyebrow">Supplier catalog</p>
          <h1>Your products</h1>
        </div>
        <Link className="button-link" href="/supplier/products/new">
          Add product
        </Link>
      </div>
      {query.error ? (
        <p className="notice error" role="alert">
          {query.error}
        </p>
      ) : null}
      {query.saved ? (
        <p className="notice success" role="status">
          Product changes saved.
        </p>
      ) : null}
      {query.warning === "image-cleanup" ? (
        <p className="notice error">
          The product was saved, but an older managed image could not be cleaned
          up. The current image is available.
        </p>
      ) : null}
      <div className="catalog-grid">
        {products.map((product) => (
          <article className="product-card" key={product.id}>
            <ProductImage imageUrl={product.imageUrl} name={product.name} />
            <div className="row">
              <span className="badge">
                {product.archivedAt ? "Archived" : "Active"}
              </span>
              <span>{product.stockQuantity} in stock</span>
            </div>
            <h2>{product.name}</h2>
            <p>{product.category.name}</p>
            <strong>{formatMinorUnits(product.priceMinor)}</strong>
            <div className="row">
              <Link href={`/supplier/products/${product.id}/edit`}>Edit</Link>
              {!product.archivedAt ? (
                <form action={archiveProductAction}>
                  <input name="id" type="hidden" value={product.id} />
                  <button className="text-button" type="submit">
                    Archive
                  </button>
                </form>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {!products.length ? (
        <div className="panel empty-state">
          <p>No products yet.</p>
          <Link className="button-link" href="/supplier/products/new">
            Add product
          </Link>
        </div>
      ) : null}
    </main>
  );
}
