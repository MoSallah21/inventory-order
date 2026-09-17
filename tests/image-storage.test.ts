import { describe, expect, it, vi } from "vitest";

import type { UploadApiResponse } from "cloudinary";
import { AppError } from "@/lib/errors";
import {
  CloudinaryProductImageStorage,
  reportImageProviderUploadFailure,
  type CloudinaryGateway,
} from "@/modules/catalog/image-storage";
import type { ValidatedProductImage } from "@/modules/catalog/product-image";

const configured = () => ({
  cloud_name: "trusted-cloud",
  api_key: "test-key",
  api_secret: "test-secret",
});
const image: ValidatedProductImage = {
  bytes: Buffer.from([1]),
  format: "jpg",
  mimeType: "image/jpeg",
  size: 1,
};

function response(
  storageKey: string,
  overrides: Partial<UploadApiResponse> = {},
): UploadApiResponse {
  return {
    public_id: storageKey,
    secure_url: `https://res.cloudinary.com/trusted-cloud/image/upload/v1/${storageKey}.jpg`,
    resource_type: "image",
    format: "jpg",
    bytes: 123,
    width: 1,
    height: 1,
    ...overrides,
  } as UploadApiResponse;
}

function gatewayWith(
  transform: (storageKey: string) => UploadApiResponse,
  deleteResult = "ok",
) {
  const deleted: string[] = [];
  const gateway: CloudinaryGateway = {
    async upload(_image, storageKey) {
      return transform(storageKey);
    },
    async delete(storageKey) {
      deleted.push(storageKey);
      return { result: deleteResult };
    },
  };
  return { gateway, deleted };
}

describe("Cloudinary product image adapter", () => {
  it("emits only normalized metadata for an upload transport failure", async () => {
    const sensitive = {
      name: "CloudinaryError",
      http_code: 503,
      message: "credential test-secret failed for trusted-cloud",
      stack: "secret stack",
      api_key: "test-key",
      api_secret: "test-secret",
      signature: "request-signature",
      bytes: image.bytes,
      filename: "private.jpg",
      productId: "product-123",
      userId: "user-456",
      response: { body: "provider response" },
      arbitrary: "must-not-appear",
    };
    const gateway: CloudinaryGateway = {
      async upload() {
        throw sensitive;
      },
      async delete() {
        return { result: "ok" };
      },
    };
    const lines: string[] = [];
    const diagnostic = (error: unknown) =>
      reportImageProviderUploadFailure(error, (line) => lines.push(line));

    await expect(
      new CloudinaryProductImageStorage(
        gateway,
        configured,
        vi.fn(),
        diagnostic,
      ).upload(image),
    ).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE_ERROR",
      message: "Image storage is temporarily unavailable.",
    });
    expect(lines).toEqual([
      "[product-image-provider] operation=upload name=CloudinaryError httpCode=503\n",
    ]);
    expect(lines.join(" ")).not.toMatch(
      /credential|secret|trusted-cloud|test-key|signature|private|product-123|user-456|provider response|arbitrary|\[object Object\]|1/,
    );
  });

  it.each([
    [{ name: "bad name!", http_code: 99 }],
    [{ name: "x".repeat(65), httpCode: 600 }],
    [new Error("must remain private")],
    ["not metadata"],
  ])("normalizes malformed upload failure metadata to unknown", (error) => {
    const lines: string[] = [];
    reportImageProviderUploadFailure(error, (line) => lines.push(line));
    expect(lines).toEqual([
      "[product-image-provider] operation=upload name=unknown httpCode=unknown\n",
    ]);
  });

  it("accepts the camel-case HTTP code field", () => {
    const lines: string[] = [];
    reportImageProviderUploadFailure(
      { name: "Provider.Error", httpCode: 429 },
      (line) => lines.push(line),
    );
    expect(lines).toEqual([
      "[product-image-provider] operation=upload name=Provider.Error httpCode=429\n",
    ]);
  });

  it("emits no upload failure diagnostic for a successful upload", async () => {
    const { gateway } = gatewayWith((key) => response(key));
    const diagnostic = vi.fn();
    await new CloudinaryProductImageStorage(
      gateway,
      configured,
      vi.fn(),
      diagnostic,
    ).upload(image);
    expect(diagnostic).not.toHaveBeenCalled();
  });

  it("accepts a fully validated response", async () => {
    const { gateway } = gatewayWith((key) => response(key));
    await expect(
      new CloudinaryProductImageStorage(gateway, configured).upload(image),
    ).resolves.toMatchObject({
      url: expect.stringMatching(
        /^https:\/\/res\.cloudinary\.com\/trusted-cloud\/image\/upload\/inventory-order\/product-images\/[0-9a-f-]{36}\.jpg$/,
      ),
      storageKey: expect.stringMatching(
        /^inventory-order\/product-images\/[0-9a-f-]{36}$/,
      ),
    });
  });

  it.each(["1234567890", "12345678901234567890"])(
    "accepts a bounded numeric Cloudinary version %s",
    async (version) => {
      const { gateway } = gatewayWith((key) =>
        response(key, {
          secure_url: `https://res.cloudinary.com/trusted-cloud/image/upload/v${version}/${key}.jpg`,
        }),
      );
      await expect(
        new CloudinaryProductImageStorage(gateway, configured).upload(image),
      ).resolves.toMatchObject({ storageKey: expect.any(String) });
    },
  );

  it.each([
    ["missing bytes", { bytes: undefined }],
    ["oversized bytes", { bytes: 5 * 1024 * 1024 + 1 }],
    ["fractional bytes", { bytes: 1.5 }],
    ["wrong resource type", { resource_type: "raw" }],
    ["wrong format", { format: "png" }],
    ["missing width", { width: undefined }],
    ["missing height", { height: undefined }],
    ["zero width", { width: 0 }],
    ["negative height", { height: -1 }],
    ["fractional width", { width: 1.5 }],
    ["unsafe height", { height: Number.MAX_SAFE_INTEGER + 1 }],
  ])("rejects invalid provider metadata: %s", async (_name, overrides) => {
    const { gateway, deleted } = gatewayWith((key) =>
      response(key, overrides as Partial<UploadApiResponse>),
    );
    await expect(
      new CloudinaryProductImageStorage(gateway, configured).upload(image),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_ERROR" });
    expect(deleted).toHaveLength(1);
  });

  it.each([
    ["absent", "absent"],
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace-only", "   "],
    ["non-string", 123],
  ])(
    "rejects a %s secure_url and compensates only the generated expected key",
    async (_name, secureUrl) => {
      const returned =
        "inventory-order/product-images/11111111-1111-4111-8111-111111111111";
      let generated = "";
      const { gateway, deleted } = gatewayWith((key) => {
        generated = key;
        const result = response(key, { public_id: returned });
        if (secureUrl === "absent")
          delete (result as { secure_url?: unknown }).secure_url;
        else (result as { secure_url?: unknown }).secure_url = secureUrl;
        return result;
      });
      await expect(
        new CloudinaryProductImageStorage(gateway, configured).upload(image),
      ).rejects.toMatchObject({
        code: "EXTERNAL_SERVICE_ERROR",
        message: "Image storage returned an invalid response.",
      });
      expect(deleted).toEqual([generated]);
      expect(deleted).not.toContain(returned);
    },
  );

  it.each([
    [
      "HTTP",
      (key: string) =>
        `http://res.cloudinary.com/trusted-cloud/image/upload/${key}.jpg`,
    ],
    [
      "alternate host",
      (key: string) =>
        `https://example.test/trusted-cloud/image/upload/${key}.jpg`,
    ],
    [
      "wrong cloud boundary",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud-extra/image/upload/${key}.jpg`,
    ],
    [
      "another object",
      () =>
        "https://res.cloudinary.com/trusted-cloud/image/upload/inventory-order/product-images/11111111-1111-4111-8111-111111111111.jpg",
    ],
    [
      "encoded slash",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key.replace("/", "%2F")}.jpg`,
    ],
    [
      "raw backslash",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key.replace("/", "\\")}.jpg`,
    ],
    [
      "encoded backslash uppercase",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key.replace("/", "%5C")}.jpg`,
    ],
    [
      "encoded backslash lowercase",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key.replace("/", "%5c")}.jpg`,
    ],
    [
      "double encoded backslash",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key.replace("/", "%255C")}.jpg`,
    ],
    [
      "double encoded slash",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key.replace("/", "%252F")}.jpg`,
    ],
    [
      "duplicate separators",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key.replace("/", "//")}.jpg`,
    ],
    [
      "encoded duplicate separator",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key.replace("/", "/%2F")}.jpg`,
    ],
    [
      "dot segment",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/ignored/../${key}.jpg`,
    ],
    [
      "transformation",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/c_fill,w_10/${key}.jpg`,
    ],
    [
      "wrong extension",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key}.png`,
    ],
    [
      "extra extension",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key}.jpg.png`,
    ],
    [
      "public ID suffix",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key}-suffix.jpg`,
    ],
    [
      "same public ID prefix",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key.slice(0, -1)}0.jpg`,
    ],
    [
      "extra path segment",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/extra/${key}.jpg`,
    ],
    [
      "excessive version length",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v123456789012345678901/${key}.jpg`,
    ],
    [
      "version missing digits",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v/${key}.jpg`,
    ],
    [
      "negative version",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v-1/${key}.jpg`,
    ],
    [
      "signed version",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v+1/${key}.jpg`,
    ],
    [
      "decimal version",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v1.5/${key}.jpg`,
    ],
    [
      "exponent version",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v1e3/${key}.jpg`,
    ],
    [
      "version suffix",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v123x/${key}.jpg`,
    ],
    [
      "encoded version digit",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v%31/${key}.jpg`,
    ],
    [
      "encoded version separator",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v123%2Fextra/${key}.jpg`,
    ],
    [
      "additional version segment",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v1/v2/${key}.jpg`,
    ],
    [
      "uppercase version",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/V123/${key}.jpg`,
    ],
    [
      "version whitespace",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/v%20123/${key}.jpg`,
    ],
    [
      "credentials",
      (key: string) =>
        `https://user:password@res.cloudinary.com/trusted-cloud/image/upload/${key}.jpg`,
    ],
    [
      "port",
      (key: string) =>
        `https://res.cloudinary.com:444/trusted-cloud/image/upload/${key}.jpg`,
    ],
    [
      "query",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key}.jpg?other=1`,
    ],
    [
      "fragment",
      (key: string) =>
        `https://res.cloudinary.com/trusted-cloud/image/upload/${key}.jpg#other`,
    ],
    ["malformed", () => "not a URL"],
  ])("rejects a non-exact object URL: %s", async (_name, buildUrl) => {
    const { gateway, deleted } = gatewayWith((key) =>
      response(key, { secure_url: buildUrl(key) }),
    );
    await expect(
      new CloudinaryProductImageStorage(gateway, configured).upload(image),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_ERROR" });
    expect(deleted).toHaveLength(1);
  });

  it("rejects a distinct returned key and deletes only the generated expected key", async () => {
    const returned =
      "inventory-order/product-images/11111111-1111-4111-8111-111111111111";
    const { gateway, deleted } = gatewayWith((key) =>
      response(key, { public_id: returned }),
    );
    await expect(
      new CloudinaryProductImageStorage(gateway, configured).upload(image),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_ERROR" });
    expect(deleted).toHaveLength(1);
    expect(deleted).not.toContain(returned);
  });

  it("preserves validation failure and emits a safe signal if cleanup fails", async () => {
    const { gateway } = gatewayWith(
      (key) => response(key, { format: "png" }),
      "unexpected",
    );
    const signal = vi.fn();
    const uploadDiagnostic = vi.fn();
    await expect(
      new CloudinaryProductImageStorage(
        gateway,
        configured,
        signal,
        uploadDiagnostic,
      ).upload(image),
    ).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE_ERROR",
      message: "Image storage returned an invalid response.",
    });
    expect(signal).toHaveBeenCalledWith(
      "invalid-provider-response",
      expect.stringMatching(/^inventory-order\/product-images\//),
      expect.any(AppError),
    );
    expect(uploadDiagnostic).not.toHaveBeenCalled();
  });

  it.each(["ok", "not found"])(
    "accepts idempotent delete result %s",
    async (result) => {
      const { gateway } = gatewayWith((key) => response(key), result);
      await expect(
        new CloudinaryProductImageStorage(gateway, configured).delete(
          "inventory-order/product-images/11111111-1111-4111-8111-111111111111",
        ),
      ).resolves.toBeUndefined();
    },
  );

  it("rejects unexpected delete results", async () => {
    const { gateway } = gatewayWith((key) => response(key), "failed");
    await expect(
      new CloudinaryProductImageStorage(gateway, configured).delete(
        "inventory-order/product-images/11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_ERROR" });
  });

  it("rejects out-of-namespace deletion before calling the SDK gateway", async () => {
    const { gateway, deleted } = gatewayWith((key) => response(key));
    await expect(
      new CloudinaryProductImageStorage(gateway, configured).delete(
        "other-supplier/object",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(deleted).toEqual([]);
  });
});
