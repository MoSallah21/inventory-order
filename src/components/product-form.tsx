"use client";

import Link from "next/link";
import type { Category, Product } from "@/generated/prisma/client";
import { useState } from "react";
import { useFormStatus } from "react-dom";

export function productImageInputName(
  editing: boolean,
  selectedFileCount: number,
) {
  return !editing || selectedFileCount > 0 ? "image" : undefined;
}

export function hasProductImageMutationConflict(data: FormData) {
  return data.get("removeImage") === "on" && data.has("image");
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} type="submit">
      {pending ? "Uploading…" : editing ? "Save product" : "Create product"}
    </button>
  );
}

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  categories: Pick<Category, "id" | "name">[];
  product?: Pick<
    Product,
    | "id"
    | "name"
    | "description"
    | "categoryId"
    | "priceMinor"
    | "stockQuantity"
    | "imageUrl"
  >;
};

export function ProductForm({ action, categories, product }: Props) {
  const [selectedFileCount, setSelectedFileCount] = useState(0);
  const editing = Boolean(product);
  const price = product
    ? `${product.priceMinor / 100n}.${(product.priceMinor % 100n).toString().padStart(2, "0")}`
    : "";
  return (
    <form
      action={action}
      className="form-grid"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        if (hasProductImageMutationConflict(data)) {
          event.preventDefault();
          window.alert("Choose either a replacement image or Remove image.");
        }
      }}
    >
      {product ? <input name="id" type="hidden" value={product.id} /> : null}
      <h2 className="form-section-title full">Basic information</h2>
      <label>
        Name
        <input
          defaultValue={product?.name}
          maxLength={120}
          name="name"
          required
        />
      </label>
      <label className="full">
        Description
        <textarea
          defaultValue={product?.description}
          maxLength={2000}
          name="description"
          required
          rows={6}
        />
      </label>
      <h2 className="form-section-title full">Price and inventory</h2>
      <label>
        AED price
        <input
          defaultValue={price}
          inputMode="decimal"
          name="price"
          placeholder="49.95"
          required
        />
      </label>
      <label>
        Stock quantity
        <input
          defaultValue={product?.stockQuantity}
          max={1000000}
          min={0}
          name="stockQuantity"
          required
          step={1}
          type="number"
        />
      </label>
      <h2 className="form-section-title full">Category</h2>
      <label className="full">
        Category
        <select defaultValue={product?.categoryId} name="categoryId" required>
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <h2 className="form-section-title full">Product image</h2>
      {product ? (
        product.imageUrl ? (
          <div
            aria-label={`${product.name} current product image`}
            className="product-form-preview full"
            role="img"
            style={{
              backgroundImage: `url(${JSON.stringify(product.imageUrl)})`,
            }}
          />
        ) : (
          <div className="product-image product-image-placeholder full">
            No image
          </div>
        )
      ) : null}
      <label className="full">
        {product ? "Replace image (optional)" : "Product image"}
        <input
          accept="image/jpeg,image/png,image/webp"
          name={productImageInputName(editing, selectedFileCount)}
          onChange={(event) => {
            setSelectedFileCount(event.currentTarget.files?.length ?? 0);
          }}
          required={!product}
          type="file"
        />
      </label>
      <p className="hint full">
        JPEG, PNG, or WebP. Maximum 5 MiB. File content is checked on the
        server.
      </p>
      {product ? (
        <label className="checkbox-row full">
          <input name="removeImage" type="checkbox" /> Remove current image when
          saving
        </label>
      ) : null}
      {product ? (
        <p className="hint full">
          Leave the file field empty to keep the current image.
        </p>
      ) : null}
      <div className="action-row full">
        <SubmitButton editing={editing} />
        <Link className="button-link secondary" href="/supplier/products">
          Cancel
        </Link>
      </div>
    </form>
  );
}
