import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProduct } from "@/modules/catalog/service";

type Props = { params: Promise<{ productId: string }> };
export default async function ProductDetailPage({ params }: Props) {
  const { productId } = await params;
  const product = await getPublicProduct(productId);
  if (!product) notFound();
  return (
    <main className="page-shell narrow">
      <Link href="/products">← All products</Link>
      <article className="detail-card">
        <div
          aria-label={`${product.name} product image`}
          className="product-image"
          role="img"
          style={{
            backgroundImage: `url(${JSON.stringify(product.imageUrl)})`,
          }}
        />
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
      </article>
    </main>
  );
}
