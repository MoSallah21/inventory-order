"use client";

import Link from "next/link";
import type { Category, Product } from "@/generated/prisma/client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ProductImage } from "@/components/product-presentation";

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
      <label htmlFor="product-name">
        <span>
          Name <span className="required-marker">Required</span>
        </span>
        <input
          aria-describedby="product-name-hint"
          defaultValue={product?.name}
          id="product-name"
          maxLength={120}
          name="name"
          required
        />
        <small className="field-hint" id="product-name-hint">
          Use the name customers will recognize in the catalog.
        </small>
      </label>
      <label className="full" htmlFor="product-description">
        <span>
          Description <span className="required-marker">Required</span>
        </span>
        <textarea
          aria-describedby="product-description-hint"
          defaultValue={product?.description}
          id="product-description"
          maxLength={2000}
          name="description"
          required
          rows={6}
        />
        <small className="field-hint" id="product-description-hint">
          Explain the product clearly, including details useful for purchasing.
        </small>
      </label>
      <h2 className="form-section-title full">Category</h2>
      <label className="full" htmlFor="product-category">
        <span>
          Category <span className="required-marker">Required</span>
        </span>
        <select
          defaultValue={product?.categoryId}
          id="product-category"
          name="categoryId"
          required
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <h2 className="form-section-title full">Pricing and stock</h2>
      <label htmlFor="product-price">
        <span>
          AED price <span className="required-marker">Required</span>
        </span>
        <input
          aria-describedby="product-price-hint"
          defaultValue={price}
          id="product-price"
          inputMode="decimal"
          name="price"
          placeholder="49.95"
          required
        />
        <small className="field-hint" id="product-price-hint">
          Enter the unit price in AED, including decimals when needed.
        </small>
      </label>
      <label htmlFor="product-stock">
        <span>
          Stock quantity <span className="required-marker">Required</span>
        </span>
        <input
          aria-describedby="product-stock-hint"
          defaultValue={product?.stockQuantity}
          id="product-stock"
          max={1000000}
          min={0}
          name="stockQuantity"
          required
          step={1}
          type="number"
        />
        <small className="field-hint" id="product-stock-hint">
          Use zero when the product is temporarily unavailable.
        </small>
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
          <ProductImage className="full" imageUrl={null} name={product.name} />
        )
      ) : null}
      <label className="full" htmlFor="product-image">
        <span>
          {product ? "Replace image" : "Product image"}{" "}
          <span className={product ? "optional-marker" : "required-marker"}>
            {product ? "Optional" : "Required"}
          </span>
        </span>
        <input
          accept="image/jpeg,image/png,image/webp"
          aria-describedby="product-image-hint"
          id="product-image"
          name={productImageInputName(editing, selectedFileCount)}
          onChange={(event) => {
            setSelectedFileCount(event.currentTarget.files?.length ?? 0);
          }}
          required={!product}
          type="file"
        />
      </label>
      <p className="field-hint full" id="product-image-hint">
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
