import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProduct } from "@/modules/catalog/service";
import { PublicNavigation } from "@/components/public-navigation";
import {
  ProductImage,
  ProductPurchaseAction,
  type PurchaseCapability,
} from "@/components/product-presentation";
import { Role } from "@/generated/prisma/enums";
import { getCurrentActor } from "@/modules/auth/authorization";

type Props = { params: Promise<{ productId: string }> };
export default async function ProductDetailPage({ params }: Props) {
  const { productId } = await params;
  const [product, actor] = await Promise.all([
    getPublicProduct(productId),
    getCurrentActor(),
  ]);
  if (!product) notFound();
  const purchaseCapability: PurchaseCapability =
    actor?.role === Role.CUSTOMER && !actor.disabledAt
      ? "customer"
      : actor
        ? "unavailable"
        : "anonymous";
  return (
    <main className="page-shell narrow">
      <PublicNavigation actor={actor} />
      <Link className="back-link" href="/products">
        ← Back to catalog
      </Link>
      <article className="detail-card product-detail editorial-detail">
        <ProductImage imageUrl={product.imageUrl} name={product.name} />
        <div className="product-detail-content">
          <p className="eyebrow">{product.category.name}</p>
          <h1>{product.name}</h1>
          <div className="product-price-block">
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
                ? `${product.stockQuantity} in stock`
                : "Out of stock"}
            </span>
          </div>
          <dl>
            <div>
              <dt>Supplier</dt>
              <dd>{product.supplierName}</dd>
            </div>
          </dl>
          <ProductPurchaseAction
            capability={purchaseCapability}
            productId={product.id}
            stockQuantity={product.stockQuantity}
          />
        </div>
        <section className="product-description">
          <p className="eyebrow">Product information</p>
          <h2>Description</h2>
          <p>{product.description}</p>
        </section>
      </article>
    </main>
  );
}
