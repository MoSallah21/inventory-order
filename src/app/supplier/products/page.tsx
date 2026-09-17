import Link from "next/link";

import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { ProductImage } from "@/components/product-presentation";
import { Role } from "@/generated/prisma/enums";
import { formatMinorUnits } from "@/lib/money";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { listSupplierProducts } from "@/modules/catalog/service";

import { archiveProductAction } from "./actions";
import { PageHeader } from "@/components/page-header";
import { AppIcon } from "@/components/app-icon";

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
    <main className="page-shell workspace-page" id="workspace-content">
      <AuthenticatedNavigation actor={actor} />
      <PageHeader
        eyebrow="Supplier inventory"
        title="Product operations"
        description="Monitor stock health, listing state, classification, and pricing across your inventory."
        actions={
          <Link className="button-link" href="/supplier/products/new">
            <AppIcon name="add" /> Add product
          </Link>
        }
        meta={
          <>
            <span className="context-chip">{products.length} products</span>
            <span className="context-chip">
              {products.filter((product) => product.stockQuantity <= 5).length}{" "}
              need attention
            </span>
          </>
        }
      />
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
      {products.length ? (
        <div
          className="table-scroll inventory-table-wrap"
          role="region"
          aria-label="Supplier product inventory"
          tabIndex={0}
        >
          <table className="data-table inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock health</th>
                <th>Listing</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="inventory-product">
                      <ProductImage
                        imageUrl={product.imageUrl}
                        name={product.name}
                      />
                      <strong>{product.name}</strong>
                    </div>
                  </td>
                  <td>{product.category.name}</td>
                  <td>
                    <strong>{formatMinorUnits(product.priceMinor)}</strong>
                  </td>
                  <td>
                    <span
                      className={
                        product.stockQuantity === 0
                          ? "stock-unavailable"
                          : product.stockQuantity <= 5
                            ? "stock-low"
                            : "stock-healthy"
                      }
                    >
                      {product.stockQuantity === 0
                        ? "Out of stock"
                        : product.stockQuantity + " units"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${product.archivedAt ? "badge-archived" : "badge-active"}`}
                    >
                      {product.archivedAt ? "Archived" : "Active"}
                    </span>
                  </td>
                  <td>
                    <div className="category-row-actions">
                      <Link
                        className="button-link secondary"
                        href={`/supplier/products/${product.id}/edit`}
                      >
                        Edit product
                      </Link>
                      {!product.archivedAt ? (
                        <form action={archiveProductAction}>
                          <input name="id" type="hidden" value={product.id} />
                          <button className="warning-action" type="submit">
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
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
