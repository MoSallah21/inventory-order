import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProduct } from "@/modules/catalog/service";
import { AddToCart } from "@/components/add-to-cart";
import { PublicNavigation } from "@/components/public-navigation";

type Props = { params: Promise<{ productId: string }> };
export default async function ProductDetailPage({ params }: Props) {
  const { productId } = await params;
  const product = await getPublicProduct(productId);
  if (!product) notFound();
  return (
    <main className="page-shell narrow">
      <PublicNavigation />
      <Link className="back-link" href="/products">
        ← Back to products
      </Link>
      <article className="detail-card">
        <div
          aria-label={`${product.name} product image`}
          className={`product-image${product.imageUrl ? "" : " product-image-placeholder"}`}
          role="img"
          style={
            product.imageUrl
              ? { backgroundImage: `url(${JSON.stringify(product.imageUrl)})` }
              : undefined
          }
        >
          {product.imageUrl ? null : "No image"}
        </div>
        <p className="eyebrow">{product.category.name}</p>
        <h1>{product.name}</h1>
        <p className="lede">{product.description}</p>
        <dl>
          <div>
            <dt>Supplier</dt>
            <dd>{product.supplierName}</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>{product.formattedPrice}</dd>
          </div>
          <div>
            <dt>Availability</dt>
            <dd>
              {product.stockQuantity > 0
                ? `${product.stockQuantity} in stock`
                : "Out of stock"}
            </dd>
          </div>
        </dl>
        {product.stockQuantity > 0 ? (
          <AddToCart disabled={false} productId={product.id} />
        ) : (
          <p className="stock-unavailable">Out of stock — unavailable to add</p>
        )}
      </article>
    </main>
  );
}
