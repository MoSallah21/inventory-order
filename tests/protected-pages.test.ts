import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const protectedPages = [
  "src/app/admin/page.tsx",
  "src/app/admin/categories/page.tsx",
  "src/app/supplier/page.tsx",
  "src/app/supplier/products/page.tsx",
  "src/app/supplier/products/new/page.tsx",
  "src/app/supplier/products/[id]/edit/page.tsx",
  "src/app/account/page.tsx",
  "src/app/orders/page.tsx",
  "src/app/orders/[orderId]/page.tsx",
];

describe("protected role pages", () => {
  it("contains no placeholder or deferred-phase copy", async () => {
    const source = await Promise.all(
      protectedPages.map((path) => readFile(`${root}/${path}`, "utf8")),
    );
    expect(source.join("\n")).not.toMatch(
      /Foundation placeholder|Domain UI is intentionally deferred/,
    );
  });

  it("uses request-time actor resolution on every protected page", async () => {
    const source = await Promise.all(
      protectedPages.map((path) => readFile(`${root}/${path}`, "utf8")),
    );
    for (const page of source) {
      expect(page).toContain("requireProtectedPage");
      expect(page).not.toContain("force-static");
    }
  });
});
