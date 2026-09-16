import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  hasProductImageMutationConflict,
  ProductForm,
  productImageInputName,
} from "@/components/product-form";

const categories = [{ id: "category", name: "Category" }];

function render(product?: Parameters<typeof ProductForm>[0]["product"]) {
  return renderToStaticMarkup(
    createElement(ProductForm, {
      action: async () => undefined,
      categories,
      product,
    }),
  );
}

function fileInput(html: string) {
  return html.match(/<input\b(?=[^>]*type="file")[^>]*>/)?.[0];
}

describe("ProductForm", () => {
  it("lets React configure a function-action form submission", () => {
    const html = render();
    const openingForm = html.match(/<form\b[^>]*>/)?.[0];

    expect(openingForm).toBeDefined();
    expect(openingForm).not.toMatch(/\bencType=/i);
    expect(openingForm).not.toMatch(/\bmethod=/i);
    expect(html).toContain('type="file"');
    expect(html).toContain('name="image"');
  });

  it("keeps create required and initially omits the optional update image field", () => {
    const createInput = fileInput(render());
    const updateInput = fileInput(
      render({
        id: "product",
        name: "Product",
        description: "Description",
        categoryId: "category",
        priceMinor: 100n,
        stockQuantity: 1,
        imageUrl: "/window.svg",
      }),
    );

    expect(createInput).toContain('name="image"');
    expect(createInput).toContain("required");
    expect(createInput).not.toContain("multiple");
    expect(updateInput).not.toContain('name="image"');
    expect(updateInput).not.toContain("required");
    expect(updateInput).not.toContain("multiple");
  });

  it("names only an actually selected update file and omits it again when cleared", () => {
    expect(productImageInputName(true, 0)).toBeUndefined();
    expect(productImageInputName(true, 1)).toBe("image");
    expect(productImageInputName(true, 0)).toBeUndefined();
    expect(productImageInputName(false, 0)).toBe("image");
  });

  it("allows removal without a file and rejects replacement plus removal", () => {
    const removal = new FormData();
    removal.set("removeImage", "on");
    expect(hasProductImageMutationConflict(removal)).toBe(false);

    removal.set("image", new File(["image"], "product.png"));
    expect(hasProductImageMutationConflict(removal)).toBe(true);
  });
});
