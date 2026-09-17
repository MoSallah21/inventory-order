import Link from "next/link";
import { connection } from "next/server";
import { PublicNavigation } from "@/components/public-navigation";
import {
  ProductImage,
  ProductPurchaseAction,
  type PurchaseCapability,
} from "@/components/product-presentation";
import { Role } from "@/generated/prisma/enums";
import { parsePage, type QueryValue } from "@/lib/pagination";
import { getCurrentActor } from "@/modules/auth/authorization";
import { listPublicProductsPage } from "@/modules/catalog/service";
import { PageHeader } from "@/components/page-header";
import { AppIcon } from "@/components/app-icon";

type Query = Record<string, QueryValue>;
type Props = { searchParams: Promise<Query> };

function productHref(query: Query, page: number) {
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "category",
    "supplier",
    "minPrice",
    "maxPrice",
    "inStock",
  ] as const) {
    const value = query[key];
    if (typeof value === "string" && value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/products?${suffix}` : "/products";
}

export default async function ProductsPage({ searchParams }: Props) {
  await connection();
  const query = await searchParams;
  const [result, actor] = await Promise.all([
    listPublicProductsPage(query, parsePage(query.page)),
    getCurrentActor(),
  ]);
  const purchaseCapability: PurchaseCapability =
    actor?.role === Role.CUSTOMER && !actor.disabledAt
      ? "customer"
      : actor
        ? "unavailable"
        : "anonymous";
  const { products, filters, options } = result;
  const hasFilters = Boolean(
    filters.q ||
    filters.category ||
    filters.supplier ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.inStock,
  );
  return (
    <main className="page-shell">
      <PublicNavigation actor={actor} />
      <PageHeader
        eyebrow="Live inventory"
        title="Product catalog"
        description="Browse active inventory from verified suppliers and inspect real-time availability."
        meta={
          <span className="context-chip">
            {result.totalCount} available listings
          </span>
        }
      />
      <form action="/products" className="panel filter-form" method="get">
        <div className="filter-heading">
          <AppIcon name="filters" />
          <div>
            <strong>Filter inventory</strong>
            <span>Refine by product, source, price, or stock.</span>
          </div>
        </div>
        <label>
          Product name
          <input defaultValue={filters.q} name="q" type="search" />
        </label>
        <label>
          Category
          <select defaultValue={filters.category} name="category">
            <option value="">All categories</option>
            {options.categories.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supplier
          <select defaultValue={filters.supplier} name="supplier">
            <option value="">All suppliers</option>
            {options.suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum price (AED)
          <input
            defaultValue={filters.minPrice}
            inputMode="decimal"
            name="minPrice"
            placeholder="0.00"
          />
        </label>
        <label>
          Maximum price (AED)
          <input
            defaultValue={filters.maxPrice}
            inputMode="decimal"
            name="maxPrice"
            placeholder="100.00"
          />
        </label>
        <label className="checkbox-label">
          <input
            defaultChecked={filters.inStock}
            name="inStock"
            type="checkbox"
            value="true"
          />{" "}
          In stock only
        </label>
        <div className="filter-actions">
          <button type="submit">Apply filters</button>
          {hasFilters ? (
            <Link className="button-link secondary" href="/products">
              Clear filters
            </Link>
          ) : null}
        </div>
      </form>
      {filters.error ? (
        <p className="notice error" role="alert">
          {filters.error}
        </p>
      ) : null}
      {hasFilters && !filters.error ? (
        <p className="active-filter-summary" role="status">
          <AppIcon name="search" />
          Showing {result.totalCount} matching{" "}
          {result.totalCount === 1 ? "product" : "products"}.
        </p>
      ) : null}
      <div className="catalog-grid">
        {products.map((product) => (
          <article className="product-card" key={product.id}>
            <ProductImage imageUrl={product.imageUrl} name={product.name} />
            <p className="eyebrow">{product.category.name}</p>
            <h2>
              <Link href={`/products/${product.id}`}>{product.name}</Link>
            </h2>
            <p>{product.description}</p>
            <p>Supplied by {product.supplierName}</p>
            <div className="row">
              <strong>{product.formattedPrice}</strong>
              <span
                className={
                  product.stockQuantity > 5
                    ? "stock-healthy"
                    : product.stockQuantity > 0
                      ? "stock-low"
                      : "stock-unavailable"
                }
              >
                {product.stockQuantity > 0
                  ? `${product.stockQuantity} available`
                  : "Out of stock"}
              </span>
            </div>
            <ProductPurchaseAction
              capability={purchaseCapability}
              productId={product.id}
              stockQuantity={product.stockQuantity}
            />
          </article>
        ))}
      </div>
      {!products.length ? (
        <div className="panel empty-state">
          <p>
            {filters.error
              ? "Correct the filters to search the catalog."
              : hasFilters
                ? "No products match these filters."
                : "No products are currently available."}
          </p>
          {hasFilters ? (
            <Link className="button-link secondary" href="/products">
              Reset filters
            </Link>
          ) : (
            <Link href="/">Return home</Link>
          )}
        </div>
      ) : null}
      <nav aria-label="Product pages" className="pagination">
        <span>
          Page {result.page} of {result.pageCount} · {result.totalCount}{" "}
          products
        </span>
        <div>
          {result.page > 1 ? (
            <Link
              className="button-link secondary"
              href={productHref(query, result.page - 1)}
            >
              Previous
            </Link>
          ) : null}
          {result.page < result.pageCount ? (
            <Link
              className="button-link secondary"
              href={productHref(query, result.page + 1)}
            >
              Next
            </Link>
          ) : null}
        </div>
      </nav>
    </main>
  );
}
