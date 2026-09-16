import Link from "next/link";

import { Role } from "@/generated/prisma/enums";
import { formatMinorUnits } from "@/lib/money";
import { requireRole } from "@/modules/auth/authorization";
import { listSupplierProducts } from "@/modules/catalog/service";

import { archiveProductAction } from "./actions";

type Props = { searchParams: Promise<{ error?: string; saved?: string }> };

export default async function SupplierProductsPage({ searchParams }: Props) {
  const actor = await requireRole(Role.SUPPLIER);
  const [products, query] = await Promise.all([
    listSupplierProducts(actor),
    searchParams,
  ]);
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <Link href="/supplier">Supplier home</Link>
        <Link href="/products">Public catalog</Link>
      </nav>
      <div className="row">
        <div>
          <p className="eyebrow">Supplier catalog</p>
          <h1>Your products</h1>
        </div>
        <Link className="button-link" href="/supplier/products/new">
          Add product
        </Link>
      </div>
      {query.error ? <p className="notice error">{query.error}</p> : null}
      {query.saved ? (
        <p className="notice success">Product changes saved.</p>
      ) : null}
      <div className="catalog-grid">
        {products.map((product) => (
          <article className="product-card" key={product.id}>
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
      {!products.length ? <p className="empty">No products yet.</p> : null}
    </main>
  );
}
