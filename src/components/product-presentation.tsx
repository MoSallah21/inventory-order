import Link from "next/link";

import { AddToCart } from "@/components/add-to-cart";

export type PurchaseCapability = "customer" | "anonymous" | "unavailable";

export function ProductImage({
  imageUrl,
  name,
  className = "",
}: {
  imageUrl: string | null;
  name: string;
  className?: string;
}) {
  return (
    <div
      aria-label={`${name} product image`}
      className={`product-image${imageUrl ? "" : " product-image-placeholder"}${className ? ` ${className}` : ""}`}
      role="img"
      style={
        imageUrl
          ? { backgroundImage: `url(${JSON.stringify(imageUrl)})` }
          : undefined
      }
    >
      {imageUrl ? null : "No image"}
    </div>
  );
}

export function ProductPurchaseAction({
  capability,
  productId,
  stockQuantity,
}: {
  capability: PurchaseCapability;
  productId: string;
  stockQuantity: number;
}) {
  if (capability === "customer") {
    return <AddToCart productId={productId} stockQuantity={stockQuantity} />;
  }

  if (stockQuantity <= 0) {
    return (
      <p className="stock-unavailable">Out of stock — unavailable to add</p>
    );
  }

  if (capability === "anonymous") {
    return (
      <Link className="purchase-sign-in" href="/sign-in">
        Sign in as Customer to purchase
      </Link>
    );
  }

  return null;
}
