import { describe, expect, it } from "vitest";

import {
  PRODUCT_IMAGE_MAX_BYTES,
  validateProductImage,
} from "@/modules/catalog/product-image";
import { genuineProductImages } from "./fixtures/product-images";

const jpeg = genuineProductImages.baselineJpeg;
const png = genuineProductImages.png;
const webp = genuineProductImages.lossyWebp;

function file(bytes: ArrayLike<number>, type: string, name = "untrusted.bin") {
  return new File([new Uint8Array(bytes)], name, { type });
}

function removePngChunk(bytes: Buffer, removedType: string) {
  const parts = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (bytes.toString("ascii", offset + 4, offset + 8) !== removedType)
      parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(parts);
}

type WebpChunk = { type: string; data: Buffer };

function webpChunks(bytes: Buffer): WebpChunk[] {
  const chunks: WebpChunk[] = [];
  let offset = 12;
  while (offset < bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    chunks.push({
      type,
      data: Buffer.from(bytes.subarray(offset + 8, offset + 8 + length)),
    });
    offset += 8 + length + (length % 2);
  }
  return chunks;
}

function buildWebp(chunks: WebpChunk[]) {
  const encoded = chunks.map(({ type, data }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32LE(data.length, 4);
    return Buffer.concat([
      header,
      data,
      ...(data.length % 2 ? [Buffer.from([0])] : []),
    ]);
  });
  const body = Buffer.concat([Buffer.from("WEBP"), ...encoded]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function extendedWithPayload(payload: WebpChunk, flags = 0) {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = flags;
  vp8x.writeUIntLE(2, 4, 3);
  vp8x.writeUIntLE(1, 7, 3);
  return buildWebp([{ type: "VP8X", data: vp8x }, payload]);
}

function extendedChunks(
  payload: WebpChunk,
  flags = 0,
  before: WebpChunk[] = [],
  after: WebpChunk[] = [],
) {
  return buildWebp([
    ...webpChunks(extendedWithPayload(payload, flags)).slice(0, 1),
    ...before,
    payload,
    ...after,
  ]);
}

describe("product image validation", () => {
  it.each([
    [jpeg, "image/jpeg", "jpg"],
    [genuineProductImages.progressiveJpeg, "image/jpeg", "jpg"],
    [png, "image/png", "png"],
    [webp, "image/webp", "webp"],
    [genuineProductImages.losslessWebp, "image/webp", "webp"],
    [genuineProductImages.extendedWebp, "image/webp", "webp"],
  ])("accepts genuine supported image bytes", async (bytes, type, format) => {
    await expect(
      validateProductImage(file(bytes, type), true),
    ).resolves.toMatchObject({ format, mimeType: type });
  });

  it("does not trust filename extensions", async () => {
    await expect(
      validateProductImage(file(png, "image/png", "actually-not.jpg"), true),
    ).resolves.toMatchObject({ format: "png" });
  });

  it.each([
    [[], "image/png", "empty"],
    [[0x3c, 0x73, 0x76, 0x67], "image/svg+xml", "svg"],
    [[0x47, 0x49, 0x46, 0x38], "image/gif", "gif"],
    [[0x25, 0x50, 0x44, 0x46], "application/pdf", "pdf"],
    [[0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74], "text/html", "html"],
    [[1, 2, 3, 4], "image/png", "unknown"],
  ])("rejects %s content", async (bytes, type) => {
    await expect(
      validateProductImage(file(bytes, type), true),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it.each([
    [[0xff, 0xd8, 0xff], "image/jpeg", "bare JPEG signature"],
    [jpeg.subarray(0, 10), "image/jpeg", "truncated JPEG segment"],
    [[0xff, 0xd8, 0xff, 0xd9], "image/jpeg", "JPEG without SOF/SOS"],
    [jpeg.subarray(0, -2), "image/jpeg", "JPEG without EOI"],
    [
      genuineProductImages.progressiveJpeg.subarray(0, -20),
      "image/jpeg",
      "truncated progressive scan",
    ],
    [png.subarray(0, 8), "image/png", "bare PNG signature"],
    [removePngChunk(png, "IHDR"), "image/png", "PNG without IHDR"],
    [removePngChunk(png, "IDAT"), "image/png", "PNG without IDAT"],
    [removePngChunk(png, "IEND"), "image/png", "PNG without IEND"],
    [png.subarray(0, -2), "image/png", "truncated PNG chunk"],
    [webp.subarray(0, 12), "image/webp", "bare WebP signature"],
    [
      Buffer.concat([
        webp.subarray(0, 4),
        Buffer.from([1, 0, 0, 0]),
        webp.subarray(8),
      ]),
      "image/webp",
      "WebP RIFF mismatch",
    ],
    [
      Buffer.concat([
        webp.subarray(0, 12),
        Buffer.from("JUNK"),
        webp.subarray(16),
      ]),
      "image/webp",
      "unsupported WebP chunk",
    ],
    [webp.subarray(0, -1), "image/webp", "truncated WebP chunk"],
  ])("rejects structurally invalid %s", async (...testCase) => {
    const [bytes, type] = testCase;
    await expect(
      validateProductImage(file(bytes, type), true),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects a header-only VP8X container", async () => {
    const headerOnly = Buffer.from(
      genuineProductImages.extendedWebp.subarray(0, 30),
    );
    headerOnly.writeUInt32LE(22, 4);
    await expect(
      validateProductImage(file(headerOnly, "image/webp"), true),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  describe("extended WebP policy", () => {
    const extended = webpChunks(genuineProductImages.extendedWebp);
    const lossyPayload = webpChunks(genuineProductImages.lossyWebp)[0];
    const losslessPayload = webpChunks(genuineProductImages.losslessWebp)[0];

    it.each([
      ["matching VP8", extendedWithPayload(lossyPayload)],
      ["matching VP8L", extendedWithPayload(losslessPayload)],
      ["genuine EXIF after payload", genuineProductImages.extendedWebp],
    ])("accepts supported %s", async (_name, bytes) => {
      await expect(
        validateProductImage(file(bytes, "image/webp"), true),
      ).resolves.toMatchObject({ format: "webp" });
    });

    describe("VP8X feature flags and reconstructive ordering", () => {
      const iccp = { type: "ICCP", data: Buffer.from("profile") };
      const alph = { type: "ALPH", data: Buffer.from([0]) };
      const exif = { type: "EXIF", data: Buffer.from("exif") };
      const xmp = { type: "XMP ", data: Buffer.from("xmp") };

      it.each([
        [
          "ICCP flag and pre-image chunk",
          extendedChunks(lossyPayload, 0x20, [iccp]),
        ],
        [
          "ALPH flag and adjacent lossy alpha",
          extendedChunks(lossyPayload, 0x10, [alph]),
        ],
        [
          "EXIF flag and post-image chunk",
          extendedChunks(lossyPayload, 0x08, [], [exif]),
        ],
        [
          "XMP flag and post-image chunk",
          extendedChunks(lossyPayload, 0x04, [], [xmp]),
        ],
        [
          "EXIF and XMP in specification-permitted order",
          extendedChunks(lossyPayload, 0x0c, [], [exif, xmp]),
        ],
        [
          "XMP and EXIF in specification-permitted order",
          extendedChunks(lossyPayload, 0x0c, [], [xmp, exif]),
        ],
      ])("accepts %s", async (_name, bytes) => {
        await expect(
          validateProductImage(file(bytes, "image/webp"), true),
        ).resolves.toMatchObject({ format: "webp" });
      });

      it.each([
        ["ICCP flag without chunk", extendedWithPayload(lossyPayload, 0x20)],
        ["ICCP chunk without flag", extendedChunks(lossyPayload, 0, [iccp])],
        ["ICCP after image", extendedChunks(lossyPayload, 0x20, [], [iccp])],
        ["duplicate ICCP", extendedChunks(lossyPayload, 0x20, [iccp, iccp])],
        ["alpha flag without ALPH", extendedWithPayload(lossyPayload, 0x10)],
        ["ALPH without alpha flag", extendedChunks(lossyPayload, 0, [alph])],
        ["ALPH after VP8", extendedChunks(lossyPayload, 0x10, [], [alph])],
        [
          "ALPH separated from VP8 by metadata",
          extendedChunks(lossyPayload, 0x18, [alph, exif]),
        ],
        ["duplicate ALPH", extendedChunks(lossyPayload, 0x10, [alph, alph])],
        ["EXIF flag without chunk", extendedWithPayload(lossyPayload, 0x08)],
        [
          "EXIF chunk without flag",
          extendedChunks(lossyPayload, 0, [], [exif]),
        ],
        ["EXIF before image", extendedChunks(lossyPayload, 0x08, [exif])],
        [
          "duplicate EXIF",
          extendedChunks(lossyPayload, 0x08, [], [exif, exif]),
        ],
        ["XMP flag without chunk", extendedWithPayload(lossyPayload, 0x04)],
        ["XMP chunk without flag", extendedChunks(lossyPayload, 0, [], [xmp])],
        ["XMP before image", extendedChunks(lossyPayload, 0x04, [xmp])],
        ["duplicate XMP", extendedChunks(lossyPayload, 0x04, [], [xmp, xmp])],
      ])("rejects %s", async (_name, bytes) => {
        await expect(
          validateProductImage(file(bytes, "image/webp"), true),
        ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      });

      const losslessWith = (alpha: boolean, versionMask = 0) => {
        const payload = {
          ...losslessPayload,
          data: Buffer.from(losslessPayload.data),
        };
        const bits = payload.data.readUInt32LE(1);
        payload.data.writeUInt32LE(
          ((bits & 0x0fffffff) | (alpha ? 0x10000000 : 0) | versionMask) >>> 0,
          1,
        );
        return payload;
      };

      it.each([
        [
          "VP8L alpha flag and intrinsic alpha both true",
          extendedWithPayload(losslessWith(true), 0x10),
        ],
        [
          "VP8L alpha flag and intrinsic alpha both false",
          extendedWithPayload(losslessWith(false), 0),
        ],
        [
          "VP8L supported zero version bits",
          extendedWithPayload(losslessWith(false, 0), 0),
        ],
      ])("accepts %s", async (_name, bytes) => {
        await expect(
          validateProductImage(file(bytes, "image/webp"), true),
        ).resolves.toMatchObject({ format: "webp" });
      });

      it.each([
        [
          "VP8L alpha flag true but intrinsic alpha false",
          extendedWithPayload(losslessWith(false), 0x10),
        ],
        [
          "VP8L alpha flag false but intrinsic alpha true",
          extendedWithPayload(losslessWith(true), 0),
        ],
        ["ALPH with VP8L", extendedChunks(losslessWith(true), 0x10, [alph])],
        [
          "VP8L version bit 29",
          extendedWithPayload(losslessWith(false, 0x20000000), 0),
        ],
        [
          "VP8L version bit 30",
          extendedWithPayload(losslessWith(false, 0x40000000), 0),
        ],
        [
          "VP8L version bit 31",
          extendedWithPayload(losslessWith(false, 0x80000000), 0),
        ],
      ])("rejects %s", async (_name, bytes) => {
        await expect(
          validateProductImage(file(bytes, "image/webp"), true),
        ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      });

      it.each([
        ["reserved flag bit 7", 0, 0x80],
        ["reserved flag bit 6", 0, 0x40],
        ["reserved flag bit 0", 0, 0x01],
        ["reserved byte 1", 1, 0x01],
        ["reserved byte 2", 2, 0x01],
        ["reserved byte 3", 3, 0x01],
      ])("rejects %s independently", async (_name, index, value) => {
        const chunks = webpChunks(extendedWithPayload(lossyPayload));
        chunks[0].data[index] = value;
        await expect(
          validateProductImage(file(buildWebp(chunks), "image/webp"), true),
        ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      });
    });

    it.each([
      [
        "animation flag without chunks",
        (() => {
          const chunks = webpChunks(genuineProductImages.extendedWebp);
          chunks[0].data[0] |= 0x02;
          return buildWebp(chunks);
        })(),
      ],
      [
        "ANIM without flag",
        buildWebp([
          extended[0],
          { type: "ANIM", data: Buffer.alloc(6) },
          extended[1],
          extended[2],
        ]),
      ],
      [
        "ANMF without flag",
        buildWebp([
          extended[0],
          { type: "ANMF", data: Buffer.alloc(16) },
          extended[1],
          extended[2],
        ]),
      ],
      [
        "animation flag and chunks",
        (() => {
          const chunks = webpChunks(genuineProductImages.extendedWebp);
          chunks[0].data[0] |= 0x02;
          return buildWebp([
            chunks[0],
            { type: "ANIM", data: Buffer.alloc(6) },
            { type: "ANMF", data: Buffer.alloc(16) },
          ]);
        })(),
      ],
      [
        "reserved feature bit",
        (() => {
          const chunks = webpChunks(genuineProductImages.extendedWebp);
          chunks[0].data[0] |= 0x80;
          return buildWebp(chunks);
        })(),
      ],
      [
        "reserved VP8X byte",
        (() => {
          const chunks = webpChunks(genuineProductImages.extendedWebp);
          chunks[0].data[1] = 1;
          return buildWebp(chunks);
        })(),
      ],
      [
        "canvas width mismatch",
        (() => {
          const chunks = webpChunks(genuineProductImages.extendedWebp);
          chunks[0].data.writeUIntLE(3, 4, 3);
          return buildWebp(chunks);
        })(),
      ],
      [
        "canvas height mismatch",
        (() => {
          const chunks = webpChunks(genuineProductImages.extendedWebp);
          chunks[0].data.writeUIntLE(2, 7, 3);
          return buildWebp(chunks);
        })(),
      ],
      [
        "both canvas dimensions mismatch",
        (() => {
          const chunks = webpChunks(genuineProductImages.extendedWebp);
          chunks[0].data.writeUIntLE(3, 4, 3);
          chunks[0].data.writeUIntLE(2, 7, 3);
          return buildWebp(chunks);
        })(),
      ],
      [
        "impossible canvas area",
        (() => {
          const chunks = webpChunks(genuineProductImages.extendedWebp);
          chunks[0].data.fill(0xff, 4, 10);
          return buildWebp(chunks);
        })(),
      ],
      [
        "truncated canvas fields",
        buildWebp([
          { type: "VP8X", data: extended[0].data.subarray(0, 9) },
          extended[1],
        ]),
      ],
      ["duplicate VP8", buildWebp([lossyPayload, lossyPayload])],
      ["VP8 plus VP8L", buildWebp([lossyPayload, losslessPayload])],
      ["duplicate VP8X", buildWebp([extended[0], extended[0], extended[1]])],
      [
        "unsupported image chunk",
        buildWebp([extended[0], { type: "VP8Y", data: Buffer.alloc(10) }]),
      ],
      [
        "zero-length image chunk",
        buildWebp([{ type: "VP8 ", data: Buffer.alloc(0) }]),
      ],
    ])("rejects %s", async (_name, bytes) => {
      await expect(
        validateProductImage(file(bytes, "image/webp"), true),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });

    it("rejects invalid, missing, and unexpected odd-size padding", async () => {
      const validOdd = buildWebp([
        (() => {
          const header = Buffer.from(extended[0].data);
          header[0] = 0x08;
          return { type: "VP8X", data: header };
        })(),
        extended[1],
        { type: "EXIF", data: Buffer.from([1]) },
      ]);
      await expect(
        validateProductImage(file(validOdd, "image/webp"), true),
      ).resolves.toMatchObject({ format: "webp" });
      const badPadding = Buffer.from(validOdd);
      badPadding[badPadding.length - 1] = 1;
      const missingPadding = validOdd.subarray(0, -1);
      const extraPadding = Buffer.concat([validOdd, Buffer.from([0])]);
      for (const bytes of [badPadding, missingPadding, extraPadding]) {
        await expect(
          validateProductImage(file(bytes, "image/webp"), true),
        ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      }
    });

    it("rejects truncated headers/payloads and RIFF sizes in both directions", async () => {
      const truncatedHeader = webp.subarray(0, 15);
      const truncatedPayload = webp.subarray(0, -3);
      const tooSmall = Buffer.from(webp);
      tooSmall.writeUInt32LE(tooSmall.readUInt32LE(4) - 2, 4);
      const tooLarge = Buffer.from(webp);
      tooLarge.writeUInt32LE(tooLarge.readUInt32LE(4) + 2, 4);
      for (const bytes of [
        truncatedHeader,
        truncatedPayload,
        tooSmall,
        tooLarge,
      ]) {
        await expect(
          validateProductImage(file(bytes, "image/webp"), true),
        ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      }
    });
  });

  describe("JPEG marker and scan branches", () => {
    const markerIndex = (bytes: Buffer, marker: number, from = 0) =>
      bytes.indexOf(Buffer.from([0xff, marker]), from);

    it("accepts a genuine progressive fixture with multiple scans and an inter-scan DHT", async () => {
      const progressive = genuineProductImages.progressiveJpeg;
      const firstSos = markerIndex(progressive, 0xda);
      const secondSos = markerIndex(progressive, 0xda, firstSos + 2);
      const interScanDht = markerIndex(progressive, 0xc4, firstSos + 2);
      expect(firstSos).toBeGreaterThan(0);
      expect(secondSos).toBeGreaterThan(firstSos);
      expect(interScanDht).toBeGreaterThan(firstSos);
      expect(interScanDht).toBeLessThan(secondSos);
      await expect(
        validateProductImage(file(progressive, "image/jpeg"), true),
      ).resolves.toMatchObject({ format: "jpg" });
    });

    it.each([
      ["FF00 byte stuffing", Buffer.from([0xff, 0x00])],
      ["restart marker", Buffer.from([0xff, 0xd0])],
    ])("handles %s inside entropy data", async (_name, insertion) => {
      const eoi = jpeg.length - 2;
      const mutated = Buffer.concat([
        jpeg.subarray(0, eoi),
        insertion,
        jpeg.subarray(eoi),
      ]);
      await expect(
        validateProductImage(file(mutated, "image/jpeg"), true),
      ).resolves.toMatchObject({ format: "jpg" });
    });

    it.each([
      ["truncated marker prefix", jpeg.subarray(0, -1)],
      ["truncated segment length", jpeg.subarray(0, 5)],
      ["truncated segment payload", jpeg.subarray(0, 12)],
      ["truncated entropy scan", jpeg.subarray(0, -8)],
      ["before EOI", jpeg.subarray(0, -2)],
    ])("rejects %s", async (_name, bytes) => {
      await expect(
        validateProductImage(file(bytes, "image/jpeg"), true),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });

    it("rejects truncated SOF and SOS payloads", async () => {
      const sof = markerIndex(jpeg, 0xc0);
      const sos = markerIndex(jpeg, 0xda);
      for (const bytes of [
        jpeg.subarray(0, sof + 7),
        jpeg.subarray(0, sos + 6),
      ]) {
        await expect(
          validateProductImage(file(bytes, "image/jpeg"), true),
        ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      }
    });

    it("rejects impossible segment length and missing SOF/SOS markers", async () => {
      const dqt = markerIndex(jpeg, 0xdb);
      const sof = markerIndex(jpeg, 0xc0);
      const sos = markerIndex(jpeg, 0xda);
      const impossible = Buffer.from(jpeg);
      impossible[dqt + 2] = 0;
      impossible[dqt + 3] = 1;
      const missingSof = Buffer.from(jpeg);
      missingSof[sof + 1] = 0xe0;
      const missingSos = Buffer.from(jpeg);
      missingSos[sos + 1] = 0xe1;
      for (const bytes of [impossible, missingSof, missingSos]) {
        await expect(
          validateProductImage(file(bytes, "image/jpeg"), true),
        ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      }
    });

    it("rejects truncation between progressive scans", async () => {
      const progressive = genuineProductImages.progressiveJpeg;
      const firstSos = markerIndex(progressive, 0xda);
      const interScanDht = markerIndex(progressive, 0xc4, firstSos + 2);
      await expect(
        validateProductImage(
          file(progressive.subarray(0, interScanDht + 3), "image/jpeg"),
          true,
        ),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });
  });

  it.each([
    [png, "image/jpeg"],
    [jpeg, "image/png"],
  ])("rejects MIME/signature mismatches", async (bytes, type) => {
    await expect(
      validateProductImage(file(bytes, type), true),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects a non-File form value", async () => {
    await expect(
      validateProductImage("not-a-file", true),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { image: ["The image submission is invalid."] },
    });
  });

  it("rejects an oversized file before reading its body", async () => {
    const oversized = file(png, "image/png");
    Object.defineProperty(oversized, "size", {
      value: PRODUCT_IMAGE_MAX_BYTES + 1,
    });
    await expect(validateProductImage(oversized, true)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("accepts an exact-5-MiB boundary with genuine structured bytes", async () => {
    const exact = file(png, "image/png");
    Object.defineProperty(exact, "size", { value: PRODUCT_IMAGE_MAX_BYTES });
    await expect(validateProductImage(exact, true)).resolves.toMatchObject({
      size: PRODUCT_IMAGE_MAX_BYTES,
      format: "png",
    });
  });

  it("treats only a missing entry as no image", async () => {
    await expect(validateProductImage(null, false)).resolves.toBeNull();
    await expect(validateProductImage(null, true)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { image: ["Choose a JPEG, PNG, or WebP image."] },
    });
  });

  it.each([
    ["React transport metadata", "blob", "application/octet-stream"],
    ["empty filename", "", "application/octet-stream"],
    ["named PNG", "empty.png", "image/png"],
    ["arbitrary metadata", "anything.bin", "text/plain"],
  ])(
    "rejects every present zero-byte File with %s",
    async (_case, name, type) => {
      await expect(
        validateProductImage(file([], type, name), false),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { image: ["The image file is empty."] },
      });
    },
  );
});
