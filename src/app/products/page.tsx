import Link from "next/link";
import { connection } from "next/server";
import { AddToCart } from "@/components/add-to-cart";
import { listPublicProducts } from "@/modules/catalog/service";

export default async function ProductsPage() {
  await connection();
  const products = await listPublicProducts();
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <Link href="/">Home</Link>
        <span className="action-row">
          <Link href="/cart">Cart</Link>
          <Link href="/orders">Orders</Link>
          <Link href="/sign-in">Sign in</Link>
        </span>
      </nav>
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
              className="product-image"
              role="img"
              style={{
                backgroundImage: `url(${JSON.stringify(product.imageUrl)})`,
              }}
            />
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
            <AddToCart
              disabled={product.stockQuantity === 0}
              productId={product.id}
            />
          </article>
        ))}
      </div>
      {!products.length ? (
        <p className="empty">No products are currently available.</p>
      ) : null}
    </main>
  );
}
