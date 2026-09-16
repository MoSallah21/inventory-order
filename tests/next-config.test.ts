import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import { PRODUCT_IMAGE_MAX_BYTES } from "@/modules/catalog/product-image";

describe("Server Action upload envelope", () => {
  it("allows a 5 MiB file plus bounded multipart overhead", () => {
    const limit = nextConfig.experimental?.serverActions?.bodySizeLimit;
    expect(limit).toBe("6mb");
    const envelopeBytes = 6 * 1024 * 1024;
    expect(envelopeBytes).toBeGreaterThan(PRODUCT_IMAGE_MAX_BYTES + 512 * 1024);
  });
});
