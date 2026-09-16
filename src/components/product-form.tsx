import type { Category, Product } from "@/generated/prisma/client";

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
  const price = product
    ? `${product.priceMinor / 100n}.${(product.priceMinor % 100n).toString().padStart(2, "0")}`
    : "";
  return (
    <form action={action} className="form-grid">
      {product ? <input name="id" type="hidden" value={product.id} /> : null}
      <label>
        Name
        <input
          defaultValue={product?.name}
          maxLength={120}
          name="name"
          required
        />
      </label>
      <label>
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
      <label className="full">
        HTTPS image URL
        <input
          defaultValue={product?.imageUrl}
          name="imageUrl"
          placeholder="https://…"
          required
          type="url"
        />
      </label>
      <p className="hint full">
        Temporary image boundary: provide an HTTPS URL. Upload support is
        intentionally deferred.
      </p>
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
      <button type="submit">
        {product ? "Save product" : "Create product"}
      </button>
    </form>
  );
}
