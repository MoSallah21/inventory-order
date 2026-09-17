import "server-only";

import { randomUUID } from "node:crypto";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

import { AppError } from "@/lib/errors";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  type ValidatedProductImage,
} from "@/modules/catalog/product-image";

export const PRODUCT_IMAGE_NAMESPACE = "inventory-order/product-images/";

export type StoredProductImage = { url: string; storageKey: string };

export interface ProductImageStorage {
  upload(image: ValidatedProductImage): Promise<StoredProductImage>;
  delete(storageKey: string): Promise<void>;
}

function serviceError(message = "Image storage is temporarily unavailable.") {
  return new AppError("EXTERNAL_SERVICE_ERROR", message);
}

function credentials() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "Image storage is not configured.",
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(cloud_name)) {
    throw new AppError(
      "CONFIGURATION_ERROR",
      "Image storage is not configured.",
    );
  }
  return { cloud_name, api_key, api_secret };
}

type CloudinaryCredentials = ReturnType<typeof credentials>;

export interface CloudinaryGateway {
  upload(
    image: ValidatedProductImage,
    storageKey: string,
    configured: CloudinaryCredentials,
  ): Promise<UploadApiResponse>;
  delete(
    storageKey: string,
    configured: CloudinaryCredentials,
  ): Promise<{ result?: string }>;
}

const officialCloudinaryGateway: CloudinaryGateway = {
  async upload(image, storageKey, configured) {
    cloudinary.config({ ...configured, secure: true });
    return new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: storageKey,
          resource_type: "image",
          type: "upload",
          overwrite: false,
          unique_filename: false,
          format: image.format,
        },
        (error, response) => {
          if (error || !response) reject(error ?? new Error("No response"));
          else resolve(response);
        },
      );
      stream.end(image.bytes);
    });
  },
  async delete(storageKey, configured) {
    cloudinary.config({ ...configured, secure: true });
    return cloudinary.uploader.destroy(storageKey, {
      resource_type: "image",
      type: "upload",
      invalidate: true,
    });
  },
};

export function isManagedProductImageKey(storageKey: string) {
  return (
    storageKey.startsWith(PRODUCT_IMAGE_NAMESPACE) &&
    /^inventory-order\/product-images\/[0-9a-f-]{36}$/.test(storageKey)
  );
}

function assertManagedKey(storageKey: string) {
  if (!isManagedProductImageKey(storageKey)) {
    throw new AppError("VALIDATION_FAILED", "Invalid managed image key.");
  }
}

export function reportImageCleanupFailure(
  operation: string,
  storageKey: string,
  error: unknown,
) {
  const category = error instanceof AppError ? error.code : "UNEXPECTED_ERROR";
  process.stderr.write(
    `[product-image-cleanup] ${operation} key=${storageKey} category=${category}\n`,
  );
}

type DiagnosticWriter = (line: string) => void;

export function reportImageProviderUploadFailure(
  error: unknown,
  write: DiagnosticWriter = (line) => process.stderr.write(line),
) {
  let name = "unknown";
  let httpCode: number | "unknown" = "unknown";

  try {
    if (typeof error === "object" && error !== null) {
      const prototype = Object.getPrototypeOf(error);
      if (prototype === Object.prototype || prototype === null) {
        const ownValue = (key: string) =>
          Object.getOwnPropertyDescriptor(error, key)?.value;
        const candidateName = ownValue("name");
        if (
          typeof candidateName === "string" &&
          /^[A-Za-z0-9_.-]{1,64}$/.test(candidateName)
        ) {
          name = candidateName;
        }
        const candidateCodes = [ownValue("http_code"), ownValue("httpCode")];
        const validCode = candidateCodes.find(
          (candidate) =>
            Number.isInteger(candidate) &&
            (candidate as number) >= 100 &&
            (candidate as number) <= 599,
        );
        if (typeof validCode === "number") httpCode = validCode;
      }
    }
  } catch {
    // Untrusted provider values must not prevent the safe application error.
  }

  write(
    `[product-image-provider] operation=upload name=${name} httpCode=${httpCode}\n`,
  );
}

export function validateCloudinaryUploadResponse(
  result: UploadApiResponse,
  expectedKey: string,
  expectedFormat: ValidatedProductImage["format"],
  cloudName: string,
): StoredProductImage {
  let url: URL;
  try {
    url = new URL(result.secure_url);
  } catch {
    throw serviceError("Image storage returned an invalid response.");
  }
  const returnedFormat = String(result.format).toLowerCase();
  const canonicalFormat = expectedFormat;
  const formatMatches =
    expectedFormat === "jpg"
      ? returnedFormat === "jpg" || returnedFormat === "jpeg"
      : returnedFormat === expectedFormat;
  const unversionedPath = `/${cloudName}/image/upload/${expectedKey}.${canonicalFormat}`;
  const versionedPath = new RegExp(
    `^/${cloudName}/image/upload/v[0-9]{1,20}/${expectedKey.replaceAll("/", "\\/")}\\.${canonicalFormat}$`,
  );
  const exactObjectUrl =
    (url.pathname === unversionedPath || versionedPath.test(url.pathname)) &&
    url.search === "" &&
    url.hash === "";
  if (
    result.resource_type !== "image" ||
    typeof result.public_id !== "string" ||
    result.public_id !== expectedKey ||
    !isManagedProductImageKey(result.public_id) ||
    typeof result.secure_url !== "string" ||
    url.href !== result.secure_url ||
    url.protocol !== "https:" ||
    url.hostname !== "res.cloudinary.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    !exactObjectUrl ||
    !formatMatches ||
    !Number.isSafeInteger(result.bytes) ||
    result.bytes <= 0 ||
    result.bytes > PRODUCT_IMAGE_MAX_BYTES ||
    !Number.isSafeInteger(result.width) ||
    result.width <= 0 ||
    !Number.isSafeInteger(result.height) ||
    result.height <= 0
  ) {
    throw serviceError("Image storage returned an invalid response.");
  }
  return {
    url: `https://res.cloudinary.com/${cloudName}/image/upload/${expectedKey}.${canonicalFormat}`,
    storageKey: result.public_id,
  };
}

export class CloudinaryProductImageStorage implements ProductImageStorage {
  constructor(
    private readonly gateway: CloudinaryGateway = officialCloudinaryGateway,
    private readonly getCredentials: () => CloudinaryCredentials = credentials,
    private readonly cleanupFailureSignal: typeof reportImageCleanupFailure = reportImageCleanupFailure,
    private readonly uploadFailureSignal: (
      error: unknown,
    ) => void = reportImageProviderUploadFailure,
  ) {}

  async upload(image: ValidatedProductImage): Promise<StoredProductImage> {
    const configured = this.getCredentials();
    const storageKey = `${PRODUCT_IMAGE_NAMESPACE}${randomUUID()}`;
    let result: UploadApiResponse;
    try {
      result = await this.gateway.upload(image, storageKey, configured);
    } catch (error: unknown) {
      try {
        this.uploadFailureSignal(error);
      } catch {
        // Diagnostics must not change the established upload error contract.
      }
      throw serviceError();
    }

    try {
      return validateCloudinaryUploadResponse(
        result,
        storageKey,
        image.format,
        configured.cloud_name,
      );
    } catch (validationError) {
      try {
        const cleanup = await this.gateway.delete(storageKey, configured);
        if (cleanup.result !== "ok" && cleanup.result !== "not found") {
          throw serviceError();
        }
      } catch (cleanupError) {
        this.cleanupFailureSignal(
          "invalid-provider-response",
          storageKey,
          cleanupError,
        );
      }
      throw validationError;
    }
  }

  async delete(storageKey: string): Promise<void> {
    assertManagedKey(storageKey);
    const configured = this.getCredentials();
    try {
      const result = await this.gateway.delete(storageKey, configured);
      if (result.result !== "ok" && result.result !== "not found") {
        throw serviceError();
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw serviceError();
    }
  }
}

export const productImageStorage = new CloudinaryProductImageStorage();
