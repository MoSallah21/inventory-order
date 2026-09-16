# Product image fixtures

These anonymous 3×2 RGB fixtures were generated on 2026-09-17 with Pillow 11.3.0 from six colored pixels and contain no
personal metadata. They cover baseline JPEG, progressive JPEG, PNG, lossy WebP (`VP8 `), lossless WebP (`VP8L`), and
extended WebP (`VP8X` plus a real `VP8 ` payload and EXIF container chunk).

Before embedding as base64 in `product-images.ts`, every emitted file was independently decoded by macOS ImageIO using
`sips`, which reported `pixelWidth: 3` and `pixelHeight: 2`. The local `file` tool independently identified the JPEG
encoding modes, PNG dimensions/bit depth, and WebP RIFF containers. Production validation does not rely on either tool.

Animated WebP is intentionally unsupported. The validator's strict extended subset accepts `VP8X`, optional pre-image
`ICCP`, optional `ALPH` immediately before lossy `VP8 `, one actual `VP8 ` or `VP8L` payload, then optional post-image
`EXIF` and `XMP ` in either order. Feature flags must agree with those chunks and VP8L's intrinsic alpha bit.
