import { AppError } from "@/lib/errors";

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProductImageFormat = "jpg" | "png" | "webp";

export type ValidatedProductImage = {
  bytes: Buffer;
  format: ProductImageFormat;
  mimeType: (typeof PRODUCT_IMAGE_MIME_TYPES)[number];
  size: number;
};

function imageError(message: string): never {
  throw new AppError("VALIDATION_FAILED", "Please correct the form.", {
    image: [message],
  });
}

function uint16be(bytes: Uint8Array, offset: number) {
  return bytes[offset] * 256 + bytes[offset + 1];
}

function uint32be(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function uint32le(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

function uint16le(bytes: Uint8Array, offset: number) {
  return bytes[offset] + bytes[offset + 1] * 256;
}

function validJpeg(bytes: Uint8Array) {
  if (bytes.length < 14 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  let hasSof = false;
  let hasSos = false;
  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);

  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset++];
    if (marker === 0xd9) return hasSof && hasSos && offset === bytes.length;
    if (marker === 0x00 || marker === 0xd8) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const length = uint16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return false;
    if (sofMarkers.has(marker)) {
      if (length < 8) return false;
      const height = uint16be(bytes, offset + 3);
      const width = uint16be(bytes, offset + 5);
      if (!width || !height) return false;
      hasSof = true;
    }
    offset += length;
    if (marker === 0xda) {
      if (!hasSof) return false;
      hasSos = true;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const markerOffset = offset;
        offset += 1;
        if (offset >= bytes.length) return false;
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
        if (offset >= bytes.length) return false;
        const entropyMarker = bytes[offset];
        if (entropyMarker === 0x00) continue;
        if (entropyMarker >= 0xd0 && entropyMarker <= 0xd7) {
          offset += 1;
          continue;
        }
        if (entropyMarker === 0xd9) return offset + 1 === bytes.length;
        offset = markerOffset;
        break;
      }
    }
  }
  return false;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function validPng(bytes: Uint8Array) {
  if (bytes.length < 45) return false;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => bytes[index] === value)) return false;
  let offset = 8;
  let chunkIndex = 0;
  let hasIdat = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return false;
    const length = uint32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) return false;
    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) return false;
      if (!uint32be(bytes, offset + 8) || !uint32be(bytes, offset + 12)) {
        return false;
      }
    } else if (type === "IHDR") {
      return false;
    }
    if (type === "IDAT") hasIdat = true;
    if (type === "IEND") {
      return length === 0 && hasIdat && end === bytes.length;
    }
    offset = end;
    chunkIndex += 1;
  }
  return false;
}

function uint24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
}

function validWebp(bytes: Uint8Array) {
  if (
    bytes.length < 26 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP" ||
    uint32le(bytes, 4) + 8 !== bytes.length
  ) {
    return false;
  }
  let offset = 12;
  let hasExtendedHeader = false;
  let hasImagePayload = false;
  let canvasWidth: number | null = null;
  let canvasHeight: number | null = null;
  let payloadWidth: number | null = null;
  let payloadHeight: number | null = null;
  let payloadHasAlpha = false;
  let payloadType: "VP8 " | "VP8L" | null = null;
  let pendingAlphaChunk = false;
  let featureFlags = 0;
  const seenMetadata = new Set<string>();
  const metadataChunks = new Set(["ICCP", "EXIF", "XMP ", "ALPH"]);
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return false;
    const type = ascii(bytes, offset, 4);
    const length = uint32le(bytes, offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + length;
    const paddedEnd = dataEnd + (length % 2);
    if (dataEnd > bytes.length || paddedEnd > bytes.length) return false;
    if (length % 2 && bytes[dataEnd] !== 0) return false;

    // In the supported extended still-image subset, ALPH is reconstructive
    // data and must be directly adjacent to the lossy payload it describes.
    if (pendingAlphaChunk && type !== "VP8 ") return false;

    if (type === "VP8X") {
      if (hasExtendedHeader || offset !== 12 || length !== 10) return false;
      featureFlags = bytes[dataOffset];
      if (
        (featureFlags & 0xc1) !== 0 ||
        (featureFlags & 0x02) !== 0 ||
        bytes[dataOffset + 1] !== 0 ||
        bytes[dataOffset + 2] !== 0 ||
        bytes[dataOffset + 3] !== 0
      ) {
        return false;
      }
      canvasWidth = uint24le(bytes, dataOffset + 4) + 1;
      canvasHeight = uint24le(bytes, dataOffset + 7) + 1;
      if (
        canvasWidth * canvasHeight > 0xffffffff ||
        !Number.isSafeInteger(canvasWidth) ||
        !Number.isSafeInteger(canvasHeight)
      ) {
        return false;
      }
      hasExtendedHeader = true;
    } else if (type === "VP8 ") {
      if (
        hasImagePayload ||
        length < 10 ||
        bytes[dataOffset + 3] !== 0x9d ||
        bytes[dataOffset + 4] !== 0x01 ||
        bytes[dataOffset + 5] !== 0x2a ||
        (uint16le(bytes, dataOffset + 6) & 0x3fff) === 0 ||
        (uint16le(bytes, dataOffset + 8) & 0x3fff) === 0
      ) {
        return false;
      }
      payloadWidth = uint16le(bytes, dataOffset + 6) & 0x3fff;
      payloadHeight = uint16le(bytes, dataOffset + 8) & 0x3fff;
      payloadType = type;
      payloadHasAlpha = pendingAlphaChunk;
      if (
        hasExtendedHeader &&
        Boolean(featureFlags & 0x10) !== pendingAlphaChunk
      ) {
        return false;
      }
      pendingAlphaChunk = false;
      hasImagePayload = true;
    } else if (type === "VP8L") {
      if (
        hasImagePayload ||
        pendingAlphaChunk ||
        seenMetadata.has("ALPH") ||
        length < 5 ||
        bytes[dataOffset] !== 0x2f
      ) {
        return false;
      }
      const bits = uint32le(bytes, dataOffset + 1);
      if (bits >>> 29 !== 0) return false;
      payloadWidth = (bits & 0x3fff) + 1;
      payloadHeight = ((bits >>> 14) & 0x3fff) + 1;
      payloadHasAlpha = ((bits >>> 28) & 1) === 1;
      payloadType = type;
      if (
        hasExtendedHeader &&
        Boolean(featureFlags & 0x10) !== payloadHasAlpha
      ) {
        return false;
      }
      hasImagePayload = true;
    } else if (type === "ANIM" || type === "ANMF") {
      return false;
    } else if (metadataChunks.has(type)) {
      if (!hasExtendedHeader || seenMetadata.has(type)) return false;
      const requiredFlag =
        type === "ICCP"
          ? 0x20
          : type === "ALPH"
            ? 0x10
            : type === "EXIF"
              ? 0x08
              : 0x04;
      if ((featureFlags & requiredFlag) === 0) return false;
      if (type === "ICCP") {
        if (hasImagePayload || seenMetadata.has("ALPH")) return false;
      } else if (type === "ALPH") {
        if (hasImagePayload || length === 0) return false;
        pendingAlphaChunk = true;
      } else if (!hasImagePayload) {
        return false;
      }
      seenMetadata.add(type);
    } else {
      return false;
    }
    offset = paddedEnd;
  }
  if (offset !== bytes.length || !hasImagePayload || pendingAlphaChunk) {
    return false;
  }
  if (!hasExtendedHeader) return true;
  if (
    canvasWidth !== payloadWidth ||
    canvasHeight !== payloadHeight ||
    Boolean(featureFlags & 0x20) !== seenMetadata.has("ICCP") ||
    Boolean(featureFlags & 0x10) !== payloadHasAlpha ||
    Boolean(featureFlags & 0x08) !== seenMetadata.has("EXIF") ||
    Boolean(featureFlags & 0x04) !== seenMetadata.has("XMP ")
  ) {
    return false;
  }
  if (payloadType === "VP8L" && seenMetadata.has("ALPH")) return false;
  return true;
}

function detectedFormat(bytes: Uint8Array): ProductImageFormat | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return validJpeg(bytes) ? "jpg" : null;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return validPng(bytes) ? "png" : null;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return validWebp(bytes) ? "webp" : null;
  }
  return null;
}

const formatMime = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export async function validateProductImage(
  value: FormDataEntryValue | null,
  required: boolean,
): Promise<ValidatedProductImage | null> {
  if (value === null) {
    if (required) imageError("Choose a JPEG, PNG, or WebP image.");
    return null;
  }
  if (!(value instanceof File)) imageError("The image submission is invalid.");
  if (value.size === 0) imageError("The image file is empty.");
  if (value.size > PRODUCT_IMAGE_MAX_BYTES) {
    imageError("The image must be 5 MiB or smaller.");
  }
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(value.type as never)) {
    imageError("Use a JPEG, PNG, or WebP image.");
  }

  const bytes = new Uint8Array(await value.arrayBuffer());
  const format = detectedFormat(bytes);
  if (!format) imageError("The file content is not a supported image.");
  const mimeType = formatMime[format];
  if (value.type !== mimeType) {
    imageError("The image type does not match its file content.");
  }
  return { bytes: Buffer.from(bytes), format, mimeType, size: value.size };
}
