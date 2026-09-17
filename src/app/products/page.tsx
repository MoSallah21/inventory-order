import Link from "next/link";
import { connection } from "next/server";
import { AddToCart } from "@/components/add-to-cart";
import { PublicNavigation } from "@/components/public-navigation";
import { parsePage, type QueryValue } from "@/lib/pagination";
import { listPublicProductsPage } from "@/modules/catalog/service";

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
  const result = await listPublicProductsPage(query, parsePage(query.page));
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
      <PublicNavigation />
      <p className="eyebrow">Public catalog</p>
      <h1>Products</h1>
      <p className="lede">
        Browse currently available products from active suppliers.
      </p>
      <form action="/products" className="panel filter-form" method="get">
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
        <p className="hint" role="status">
          Showing {result.totalCount} matching{" "}
          {result.totalCount === 1 ? "product" : "products"}.
        </p>
      ) : null}
      <div className="catalog-grid">
        {products.map((product) => (
          <article className="product-card" key={product.id}>
            <div
              aria-label={`${product.name} product image`}
              className={`product-image${product.imageUrl ? "" : " product-image-placeholder"}`}
              role="img"
              style={
                product.imageUrl
                  ? {
                      backgroundImage: `url(${JSON.stringify(product.imageUrl)})`,
                    }
                  : undefined
              }
            >
              {product.imageUrl ? null : "No image"}
            </div>
            <p className="eyebrow">{product.category.name}</p>
            <h2>
              <Link href={`/products/${product.id}`}>{product.name}</Link>
            </h2>
            <p>{product.description}</p>
            <p>Supplied by {product.supplierName}</p>
            <div className="row">
              <strong>{product.formattedPrice}</strong>
              <span>
                {product.stockQuantity > 0
                  ? `${product.stockQuantity} available`
                  : "Out of stock"}
              </span>
            </div>
            {product.stockQuantity > 0 ? (
              <AddToCart disabled={false} productId={product.id} />
            ) : (
              <p className="stock-unavailable">
                Out of stock — unavailable to add
              </p>
            )}
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
