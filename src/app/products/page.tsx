import Link from "next/link";
import { connection } from "next/server";
import { AddToCart } from "@/components/add-to-cart";
import { PublicNavigation } from "@/components/public-navigation";
import { listPublicProducts } from "@/modules/catalog/service";

export default async function ProductsPage() {
  await connection();
  const products = await listPublicProducts();
  return (
    <main className="page-shell">
      <PublicNavigation />
      <p className="eyebrow">Public catalog</p>
      <h1>Products</h1>
      <p className="lede">
        Browse currently available products from active suppliers.
      </p>
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
          <p>No products are currently available.</p>
          <Link href="/">Return home</Link>
        </div>
      ) : null}
    </main>
  );
}
